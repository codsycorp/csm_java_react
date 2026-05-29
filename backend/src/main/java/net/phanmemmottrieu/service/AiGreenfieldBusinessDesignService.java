package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * PHẦN AC — Business Comprehension & Planning for greenfield menu/code and sample-driven design.
 * Pass 1: Comprehend → BusinessSpec. Pass 2: ExecutionPlan. Worker receives compact injection block only.
 */
@Service
public class AiGreenfieldBusinessDesignService {

    private static final Logger log = LoggerFactory.getLogger(AiGreenfieldBusinessDesignService.class);

    private static final Pattern CODE_SYMBOL_PATTERN = Pattern.compile(
        "\\b(function|const|let|var)\\s+([A-Za-z_$][\\w$]*)|([A-Za-z_$][\\w$]*)\\s*[:=]\\s*function");
    private static final Set<String> SAMPLE_ATTACHMENT_ROLES = Set.of(
        "legacy_json", "reference_code", "business_logic", "system_requirement");

    public enum InputScenario {
        A_GREENFIELD,
        B_WITH_SAMPLES,
        C_EDIT_EXISTING
    }

    /** Structured scan of menu JSON for heuristic comprehend + gap-driven plan. */
    private record MenuBusinessScan(
        List<String> moduleLabels,
        List<String> tables,
        List<String> triggerSummaries,
        List<String> nodesMissingI18n,
        List<String> emptyTriggerNodeIds,
        int totalNodes,
        int tableColumnI18nGaps,
        Map<String, Integer> typeFormCounts
    ) {
        static MenuBusinessScan empty() {
            return new MenuBusinessScan(
                List.of(), List.of(), List.of(), List.of(), List.of(), 0, 0, Map.of());
        }
    }

    /** Structured scan of DynamicCode for heuristic comprehend. */
    private record CodeBusinessScan(
        List<String> symbols,
        List<String> tables,
        List<String> lifecyclePatterns,
        List<String> apiPatterns
    ) {
        static CodeBusinessScan empty() {
            return new CodeBusinessScan(List.of(), List.of(), List.of(), List.of());
        }
    }

    public record BusinessSpec(
        String domainSummary,
        String existingBusinessSummary,
        List<String> modules,
        List<String> tables,
        List<String> flows,
        List<Map<String, Object>> plannedStructure,
        List<String> triggersLearnedFromSample,
        List<String> triggersFromCurrentEditor,
        List<String> codePatternsFromSample,
        List<String> codePatternsFromCurrentEditor,
        String userDelta,
        List<String> assumptions,
        List<String> risks
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("domain_summary", domainSummary == null ? "" : domainSummary);
            m.put("existing_business_summary", existingBusinessSummary == null ? "" : existingBusinessSummary);
            m.put("modules", modules == null ? List.of() : modules);
            m.put("tables", tables == null ? List.of() : tables);
            m.put("flows", flows == null ? List.of() : flows);
            m.put("planned_structure", plannedStructure == null ? List.of() : plannedStructure);
            m.put("triggers_learned_from_sample", triggersLearnedFromSample == null ? List.of() : triggersLearnedFromSample);
            m.put("triggers_from_current_editor", triggersFromCurrentEditor == null ? List.of() : triggersFromCurrentEditor);
            m.put("code_patterns_from_sample", codePatternsFromSample == null ? List.of() : codePatternsFromSample);
            m.put("code_patterns_from_current_editor", codePatternsFromCurrentEditor == null ? List.of() : codePatternsFromCurrentEditor);
            m.put("user_delta", userDelta == null ? "" : userDelta);
            m.put("assumptions", assumptions == null ? List.of() : assumptions);
            m.put("risks", risks == null ? List.of() : risks);
            return m;
        }

        public static BusinessSpec empty() {
            return new BusinessSpec("", "", List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), "", List.of(), List.of());
        }
    }

    public record ExecutionStep(
        String id,
        String action,
        String target,
        List<String> fields
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("action", action);
            m.put("target", target);
            m.put("fields", fields == null ? List.of() : fields);
            return m;
        }
    }

    public record ExecutionPlan(
        String scenario,
        List<ExecutionStep> steps,
        String outputContract,
        List<String> acceptance
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("scenario", scenario == null ? "" : scenario);
            m.put("steps", steps == null ? List.of() : steps.stream().map(ExecutionStep::toMap).toList());
            m.put("output_contract", outputContract == null ? "" : outputContract);
            m.put("acceptance", acceptance == null ? List.of() : acceptance);
            return m;
        }
    }

    public record ComprehensionResult(
        boolean activated,
        InputScenario inputScenario,
        BusinessSpec businessSpec,
        ExecutionPlan executionPlan,
        String promptInjectionBlock,
        String operationScenario,
        boolean greenfield,
        Map<String, Object> telemetry
    ) {
        public static ComprehensionResult skipped() {
            return new ComprehensionResult(
                false,
                InputScenario.C_EDIT_EXISTING,
                BusinessSpec.empty(),
                new ExecutionPlan("", List.of(), "", List.of()),
                "",
                "",
                false,
                Map.of("skipped", true));
        }
    }

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired(required = false)
    private LlamaCppNativeService llamaCppNativeService;

    @Autowired(required = false)
    private AiAssistantGatewayService aiAssistantGatewayService;

    @Autowired(required = false)
    private AiTenantKnowledgeIngestionService aiTenantKnowledgeIngestionService;

    @Autowired(required = false)
    private AiBusinessMemoryVectorService aiBusinessMemoryVectorService;

    @Autowired(required = false)
    private RecordManager recordManager;

    @Autowired(required = false)
    private AiScopedContextIngestionService aiScopedContextIngestionService;

    @Autowired(required = false)
    private MenuQualityGateService menuQualityGateService;

    @Value("${ai.local.business-comprehension.enabled:true}")
    private boolean enabled;

    @Value("${ai.local.business-comprehension.required-on-greenfield:true}")
    private boolean requiredOnGreenfield;

    @Value("${ai.local.business-comprehension.required-on-sample-attachment:true}")
    private boolean requiredOnSampleAttachment;

    @Value("${ai.local.business-comprehension.required-on-edit-with-editor:true}")
    private boolean requiredOnEditWithEditor;

    @Value("${ai.local.business-comprehension.comprehend-max-tokens:512}")
    private int comprehendMaxTokens;

    @Value("${ai.local.business-comprehension.worker-prompt-block-max-chars:2000}")
    private int workerPromptBlockMaxChars;

    @Value("${ai.local.business-comprehension.sample-menu-digest-max-chars:4000}")
    private int sampleMenuDigestMaxChars;

    @Value("${ai.local.business-comprehension.sample-code-digest-max-chars:6000}")
    private int sampleCodeDigestMaxChars;

    @Value("${ai.local.business-comprehension.user-request-max-chars:3200}")
    private int userRequestMaxChars;

    @Value("${ai.local.business-comprehension.menu-greenfield-fast-path.enabled:false}")
    private boolean menuGreenfieldFastPathEnabled;

    /** When false, empty-menu greenfield never returns a Java heuristic seed — LLM + RAG must design. */
    @Value("${ai.local.business-comprehension.deterministic-seed-fallback.menu-greenfield.enabled:false}")
    private boolean deterministicMenuSeedOnGreenfield;

    @Value("${ai.local.business-comprehension.tenant-rag-max-chars:2800}")
    private int tenantRagMaxChars;

    @Value("${ai.local.business-comprehension.active-editor-digest-max-chars:6000}")
    private int activeEditorDigestMaxChars;

    @Value("${ai.local.business-comprehension.system-master-digest-max-chars:2400}")
    private int systemMasterDigestMaxChars;

    @Value("${ai.local.greenfield.enabled:true}")
    private boolean greenfieldEnabled;

    @Value("${ai.local.greenfield.menu-seed-module-count:1}")
    private int menuSeedModuleCount;

    @Value("${ai.local.greenfield.menu-scaffold-enabled:true}")
    private boolean menuGreenfieldScaffoldEnabled;

    /** Skip heavy LLM worker when request is comprehensive + editor empty — assemble scaffold in Java. */
    @Value("${ai.local.greenfield.menu-scaffold-first.enabled:true}")
    private boolean menuGreenfieldScaffoldFirstEnabled;

    public boolean isMenuGreenfieldScaffoldFirstEnabled() {
        return menuGreenfieldScaffoldEnabled && menuGreenfieldScaffoldFirstEnabled;
    }

    /** AD-R4 — per-module enrich after scaffold (LLM + deterministic i18n + gate). */
    @Value("${ai.local.greenfield.menu-module-enrich.enabled:true}")
    private boolean menuModuleEnrichEnabled;

    @Value("${ai.local.greenfield.menu-module-enrich.max-modules:16}")
    private int menuModuleEnrichMaxModules;

    @Value("${ai.local.greenfield.menu-module-enrich.max-tokens:384}")
    private int menuModuleEnrichMaxTokens;

    /** AD-R2 — block CodeMirror apply until menu passes hard quality gate. */
    @Value("${ai.local.greenfield.gate-before-apply.enabled:true}")
    private boolean greenfieldGateBeforeApplyEnabled;

    /** AD-R3 — Reviewer fail → Planner replan per module (LangGraph revisit). */
    @Value("${ai.local.greenfield.menu-module-replan.enabled:true}")
    private boolean menuModuleReplanEnabled;

    @Value("${ai.local.greenfield.menu-module-replan.max-attempts:1}")
    private int menuModuleReplanMaxAttempts;

    /** AD-R6 — RAG citation rows for greenfield SSE. */
    @Value("${ai.local.rag.citations.max-hits:5}")
    private int ragCitationsMaxHits;

    /** AD-R6 — index per-leaf trigger/combo patterns from live tenant index.menu. */
    @Value("${ai.local.greenfield.live-menu-pattern-index.enabled:true}")
    private boolean liveMenuPatternIndexEnabled;

    @Value("${ai.local.greenfield.live-menu-pattern-index.max-leaves:120}")
    private int liveMenuPatternIndexMaxLeaves;

    public boolean isMenuModuleEnrichEnabled() {
        return menuGreenfieldScaffoldEnabled && menuModuleEnrichEnabled;
    }

    public boolean isGreenfieldGateBeforeApplyEnabled() {
        return greenfieldGateBeforeApplyEnabled;
    }

    /** Progress callback for LangGraph-style per-module execution (SSE from controller). */
    @FunctionalInterface
    public interface ModuleEnrichProgress {
        void onProgress(ModuleEnrichEvent event);
    }

    /** AF.6 / AF-R4 — explicit multi-agent handoff telemetry (Supervisor → Retriever → …). */
    @FunctionalInterface
    public interface AgentHandoffCallback {
        void onHandoff(String fromAgent, String toAgent, String action, String detail);
    }

    public record GreenfieldApplyGateResult(
        boolean passesHardGate,
        double qualityScore,
        String menuJson,
        String issueSummary
    ) {}

    public record ModuleEnrichEvent(
        int moduleIndex,
        int moduleTotal,
        String moduleLabel,
        String nodeId,
        String status,
        String detail,
        boolean usedLlm
    ) {}

    @Value("${ai.local.business-comprehension.heuristic-fallback.enabled:false}")
    private boolean heuristicFallbackEnabled;

    @Value("${ai.local.business-comprehension.deterministic-seed-fallback:true}")
    private boolean deterministicSeedFallback;

    public boolean isEnabled() {
        return enabled && greenfieldEnabled;
    }

    public ComprehensionResult runComprehensionPipeline(
        String appId,
        String message,
        String currentCode,
        List<Map<String, Object>> attachments,
        String contextType,
        String responseMode,
        String tenantRagSnippet,
        AiEditTaskPlannerService.EditTaskPlan editTaskPlan,
        Map<String, Object> editorMetadata
    ) {
        if (!isEnabled()) {
            return ComprehensionResult.skipped();
        }
        // currentCode may be a retrieved slice (≤32k) for large-file analyze — not the full editor string.
        String safeCode = String.valueOf(currentCode == null ? "" : currentCode);
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeMode = String.valueOf(responseMode == null ? "edit" : responseMode).trim().toLowerCase(Locale.ROOT);
        String safeContext = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase(Locale.ROOT);
        List<Map<String, Object>> safeAttachments = attachments == null ? List.of() : attachments;

        boolean menuFlow = "menu_json".equals(safeContext);
        boolean menuEffectivelyEmpty = menuFlow && isEffectivelyEmptyMenu(safeCode);

        boolean hasEditor = !safeCode.isBlank() && !menuEffectivelyEmpty;
        boolean hasSamples = hasSampleSignals(safeAttachments, safeMessage, editorMetadata);
        boolean greenfield = !hasEditor;
        if ("analyze".equals(safeMode) && menuFlow && hasEditor) {
            greenfield = false;
        }

        if (!shouldActivate(greenfield, hasSamples, hasEditor, safeMode, safeMessage)) {
            return ComprehensionResult.skipped();
        }

        InputScenario scenario = detectScenario(greenfield, hasSamples, hasEditor);
        String operationScenario = extractOperationScenario(safeMessage, greenfield, menuFlow);
        String userRequest = trimToMax(safeMessage, userRequestMaxChars);
        String attachmentMenuDigest = extractSampleMenuDigest(safeAttachments, safeMessage, editorMetadata);
        String sampleMenuDigest = attachmentMenuDigest;
        if (menuFlow && greenfield) {
            String learnedMenu = resolveLearnedMenuSampleDigest(appId, userRequest);
            if (attachmentMenuDigest.isBlank()) {
                sampleMenuDigest = learnedMenu;
            } else if (!learnedMenu.isBlank()) {
                sampleMenuDigest = attachmentMenuDigest + "\n---\n" + learnedMenu;
            }
        }
        String attachmentCodeDigest = extractSampleCodeDigest(safeAttachments, safeMessage, menuFlow);
        String sampleCodeDigest = attachmentCodeDigest;
        if (!menuFlow && greenfield) {
            String learnedCode = resolveLearnedCodeSampleDigest(appId, userRequest);
            if (attachmentCodeDigest.isBlank()) {
                sampleCodeDigest = learnedCode;
            } else if (!learnedCode.isBlank()) {
                sampleCodeDigest = attachmentCodeDigest + "\n---\n" + learnedCode;
            }
        }
        String activeEditorDigest = extractActiveEditorDigest(safeCode, menuFlow);
        String systemMasterDigest = resolveSystemMasterDigest(appId, menuFlow);
        String tenantRag = resolveTenantRagSnippet(appId, safeMessage, menuFlow);

        MenuBusinessScan menuScan = menuFlow && hasEditor
            ? scanMenuBusinessStructure(safeCode)
            : MenuBusinessScan.empty();
        CodeBusinessScan codeScan = !menuFlow && hasEditor
            ? scanCodeBusinessStructure(safeCode)
            : CodeBusinessScan.empty();

        BusinessSpec spec = buildBusinessSpec(
            appId,
            userRequest,
            sampleMenuDigest,
            sampleCodeDigest,
            activeEditorDigest,
            systemMasterDigest,
            tenantRag,
            menuFlow,
            scenario,
            menuScan,
            codeScan,
            "analyze".equals(safeMode));
        if (menuFlow && greenfield && !"analyze".equals(safeMode)) {
            spec = enrichBusinessSpecForMenuGreenfield(spec, userRequest);
        }
        ExecutionPlan plan = buildExecutionPlan(
            spec,
            operationScenario,
            menuFlow,
            greenfield,
            editTaskPlan,
            safeMessage,
            menuScan,
            safeMode,
            codeScan);
        String block = "analyze".equals(safeMode)
            ? buildAnalyzeBusinessPromptBlock(spec, plan, codeScan, menuFlow, workerPromptBlockMaxChars)
            : buildWorkerPromptBlock(spec, plan, workerPromptBlockMaxChars, tenantRag, sampleMenuDigest);

        Map<String, Object> telemetry = new LinkedHashMap<>();
        telemetry.put("inputScenario", scenario.name());
        telemetry.put("greenfield", greenfield);
        telemetry.put("hasEditor", hasEditor);
        telemetry.put("hasSamples", hasSamples);
        telemetry.put("operationScenario", operationScenario);
        telemetry.put("moduleCount", spec.modules() == null ? 0 : spec.modules().size());
        telemetry.put("stepCount", plan.steps() == null ? 0 : plan.steps().size());
        telemetry.put("sampleMenuDigestChars", sampleMenuDigest.length());
        telemetry.put("sampleCodeDigestChars", sampleCodeDigest.length());
        telemetry.put("activeEditorDigestChars", activeEditorDigest.length());
        telemetry.put("systemMasterDigestChars", systemMasterDigest.length());
        telemetry.put("tenantRagChars", tenantRag.length());
        telemetry.put("existingBusinessSummary", spec.existingBusinessSummary());
        if (menuFlow && menuScan.totalNodes() > 0) {
            telemetry.put("menuNodesScanned", menuScan.totalNodes());
            telemetry.put("menuI18nGaps", menuScan.nodesMissingI18n().size());
            telemetry.put("menuEmptyTriggers", menuScan.emptyTriggerNodeIds().size());
        }

        log.info(
            "BusinessComprehension scenario={} greenfield={} modules={} steps={} menuFlow={}",
            scenario,
            greenfield,
            spec.modules() == null ? 0 : spec.modules().size(),
            plan.steps() == null ? 0 : plan.steps().size(),
            menuFlow);

        return new ComprehensionResult(
            true,
            scenario,
            spec,
            plan,
            block,
            operationScenario,
            greenfield,
            telemetry);
    }

    public String applyDeterministicSeedIfNeeded(
        String providerText,
        ComprehensionResult comprehension,
        String contextType
    ) {
        return applyDeterministicSeedIfNeeded(providerText, comprehension, contextType, "");
    }

    public String applyDeterministicSeedIfNeeded(
        String providerText,
        ComprehensionResult comprehension,
        String contextType,
        String currentMenuCode
    ) {
        if (!deterministicSeedFallback || comprehension == null || !comprehension.activated()) {
            return providerText;
        }
        String text = String.valueOf(providerText == null ? "" : providerText).trim();
        if (!text.isBlank()) {
            if (aiAssistantGatewayService != null && "menu_json".equalsIgnoreCase(contextType)) {
                if (aiAssistantGatewayService.isMenuJsonOutputActionable(text)) {
                    return providerText;
                }
            } else if (text.length() > 80) {
                return providerText;
            }
        }
        boolean menuFlow = "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType));
        if (menuFlow) {
            log.debug("Menu JSON never uses Java deterministic seed — LLM + LIVE_APP_MENU + RAG only");
            return providerText;
        }
        if (!comprehension.greenfield()) {
            return providerText;
        }
        String seed = buildDeterministicCodeSeed(comprehension.businessSpec());
        log.info("BusinessComprehension deterministic code seed fallback chars={}", seed.length());
        return seed;
    }

    /** Fast path disabled by default — menu design always goes through LLM worker. */
    public boolean shouldUseMenuGreenfieldFastPath(String userMessage) {
        return menuGreenfieldFastPathEnabled;
    }

    /** @deprecated Use LLM comprehend; kept for API compatibility — always false. */
    public boolean isRichGreenfieldMenuDesignRequest(String message) {
        return !String.valueOf(message == null ? "" : message).trim().isBlank();
    }

    private boolean isEffectivelyEmptyMenu(String menuJson) {
        if (String.valueOf(menuJson == null ? "" : menuJson).trim().isBlank()) {
            return true;
        }
        return parseMenuRoots(menuJson).isEmpty();
    }

    /** @deprecated Routing uses classifier responseMode — do not match keywords. */
    @Deprecated
    public static boolean isAnalyzeBusinessQuestion(String message) {
        return false;
    }

    private boolean shouldActivate(boolean greenfield, boolean hasSamples, boolean hasEditor, String responseMode, String message) {
        if ("analyze".equalsIgnoreCase(String.valueOf(responseMode == null ? "" : responseMode))) {
            if (hasEditor) {
                return true;
            }
            return hasSamples && requiredOnSampleAttachment;
        }
        if (hasSamples && requiredOnSampleAttachment) {
            return true;
        }
        if (greenfield && requiredOnGreenfield) {
            return true;
        }
        if (hasEditor && requiredOnEditWithEditor) {
            return true;
        }
        return false;
    }

    private InputScenario detectScenario(boolean greenfield, boolean hasSamples, boolean hasEditor) {
        if (greenfield && !hasSamples) {
            return InputScenario.A_GREENFIELD;
        }
        if (hasSamples && greenfield) {
            return InputScenario.B_WITH_SAMPLES;
        }
        if (hasSamples) {
            return InputScenario.B_WITH_SAMPLES;
        }
        return InputScenario.C_EDIT_EXISTING;
    }

    public boolean hasSampleSignals(
        List<Map<String, Object>> attachments,
        String message,
        Map<String, Object> editorMetadata
    ) {
        if (attachments != null) {
            for (Map<String, Object> att : attachments) {
                if (att == null || att.isEmpty()) {
                    continue;
                }
                String role = str(att.get("contextRole")).toLowerCase(Locale.ROOT);
                if (SAMPLE_ATTACHMENT_ROLES.contains(role)) {
                    return true;
                }
                if (Boolean.TRUE.equals(att.get("authoritative"))) {
                    return true;
                }
                String name = str(att.get("name")).toLowerCase(Locale.ROOT);
                String kind = str(att.get("kind")).toLowerCase(Locale.ROOT);
                if ("json".equals(kind) || name.endsWith(".json") || name.endsWith(".js")) {
                    return true;
                }
            }
        }
        String msg = String.valueOf(message == null ? "" : message);
        if (msg.contains("sample_menu_compact") || msg.contains("sampleMenus")) {
            return true;
        }
        if (editorMetadata != null && editorMetadata.containsKey("sample_menu_compact")) {
            return true;
        }
        return false;
    }

    private BusinessSpec buildBusinessSpec(
        String appId,
        String userRequest,
        String sampleMenuDigest,
        String sampleCodeDigest,
        String activeEditorDigest,
        String systemMasterDigest,
        String tenantRag,
        boolean menuFlow,
        InputScenario scenario,
        MenuBusinessScan menuScan,
        CodeBusinessScan codeScan,
        boolean analyzeMode
    ) {
        if (analyzeMode) {
            return buildLearnedContextBusinessSpec(
                userRequest, sampleMenuDigest, sampleCodeDigest, activeEditorDigest,
                menuFlow, scenario, menuScan, codeScan);
        }
        if (llamaCppNativeService != null
                && llamaCppNativeService.isAvailable()
                && aiAssistantGatewayService != null) {
            try {
                String prompt = aiAssistantGatewayService.buildComprehendPrompt(
                    userRequest,
                    sampleMenuDigest,
                    sampleCodeDigest,
                    activeEditorDigest,
                    systemMasterDigest,
                    tenantRag,
                    menuFlow,
                    scenario.name());
                String raw = llamaCppNativeService.generateContentFast(prompt, Math.max(256, comprehendMaxTokens));
                BusinessSpec parsed = parseBusinessSpecJson(raw);
                if (parsed != null && !parsed.domainSummary().isBlank()) {
                    log.info("BusinessSpec comprehend source=llm modules={}",
                        parsed.modules() == null ? 0 : parsed.modules().size());
                    return parsed;
                }
            } catch (Exception ex) {
                log.warn("BusinessSpec LLM comprehend failed: {}", ex.getMessage());
            }
        }
        log.info("BusinessSpec comprehend source=heuristic_learned_context userRequestChars={}",
            String.valueOf(userRequest == null ? "" : userRequest).length());
        return buildLearnedContextBusinessSpec(
            userRequest, sampleMenuDigest, sampleCodeDigest, activeEditorDigest,
            menuFlow, scenario, menuScan, codeScan);
    }

    private BusinessSpec parseBusinessSpecJson(String raw) {
        if (raw == null || raw.isBlank() || objectMapper == null) {
            return null;
        }
        try {
            String json = extractJsonObject(raw);
            if (json.isBlank()) {
                return null;
            }
            JsonNode root = objectMapper.readTree(json);
            return new BusinessSpec(
                root.path("domain_summary").asText(""),
                root.path("existing_business_summary").asText(""),
                readStringList(root.get("modules")),
                readStringList(root.get("tables")),
                readStringList(root.get("flows")),
                readPlannedStructureList(root.get("planned_structure")),
                readStringList(root.get("triggers_learned_from_sample")),
                readStringList(root.get("triggers_from_current_editor")),
                readStringList(root.get("code_patterns_from_sample")),
                readStringList(root.get("code_patterns_from_current_editor")),
                root.path("user_delta").asText(""),
                readStringList(root.get("assumptions")),
                readStringList(root.get("risks")));
        } catch (Exception ex) {
            log.debug("parseBusinessSpecJson failed: {}", ex.getMessage());
            return null;
        }
    }

    /** Data-driven BusinessSpec — scans + LIVE_APP_MENU + user text, no ERP keyword maps. */
    private BusinessSpec buildLearnedContextBusinessSpec(
        String userRequest,
        String sampleMenuDigest,
        String sampleCodeDigest,
        String activeEditorDigest,
        boolean menuFlow,
        InputScenario scenario,
        MenuBusinessScan menuScan,
        CodeBusinessScan codeScan
    ) {
        List<String> modules;
        List<String> tables;
        List<String> triggersCurrent;
        List<String> codePatternsCurrent;
        List<String> flows = new ArrayList<>();
        String existingSummary;

        if (menuFlow && menuScan != null && menuScan.totalNodes() > 0) {
            modules = new ArrayList<>(menuScan.moduleLabels());
            tables = new ArrayList<>(menuScan.tables());
            triggersCurrent = new ArrayList<>(menuScan.triggerSummaries());
            codePatternsCurrent = List.of();
            flows.add("list → form → save → trigger/filter");
            if (!menuScan.typeFormCounts().isEmpty()) {
                flows.add("type_form mix: " + formatTypeFormCounts(menuScan.typeFormCounts()));
            }
            existingSummary = buildMenuExistingSummary(menuScan, activeEditorDigest);
        } else if (!menuFlow && codeScan != null && !codeScan.symbols().isEmpty()) {
            modules = inferBusinessModulesFromCodeScan(codeScan);
            tables = new ArrayList<>(codeScan.tables());
            triggersCurrent = List.of();
            codePatternsCurrent = mergeStringLists(codeScan.lifecyclePatterns(), codeScan.apiPatterns());
            flows.add("init → load data → bind events → save");
            if (!codeScan.lifecyclePatterns().isEmpty()) {
                flows.add("lifecycle: " + String.join(", ", codeScan.lifecyclePatterns().stream().limit(4).toList()));
            }
            existingSummary = buildCodeExistingSummary(codeScan, activeEditorDigest);
        } else {
            modules = extractModulesFromLearnedContext(userRequest, sampleMenuDigest, menuScan);
            tables = extractTablesFromText(
                userRequest + " " + sampleMenuDigest + " " + activeEditorDigest);
            triggersCurrent = extractTriggerHints(activeEditorDigest);
            if (triggersCurrent.isEmpty()) {
                triggersCurrent = extractTriggerHints(sampleMenuDigest);
            }
            codePatternsCurrent = extractCodePatternsFromText(activeEditorDigest);
            if (menuFlow) {
                flows.add("Derive type_form/table/trigger from LIVE_APP_MENU patterns + USER_REQUEST");
            } else {
                flows.add("Derive code regions from SAMPLE_CODE + USER_REQUEST");
            }
            existingSummary = trimToMax(
                activeEditorDigest.isBlank()
                    ? (sampleMenuDigest.isBlank()
                        ? "Greenfield — modules from USER_REQUEST + tenant LIVE_APP_MENU/RAG"
                        : "Greenfield — learned from LIVE_APP_MENU/RAG digest")
                    : activeEditorDigest,
                1200);
        }

        List<String> triggersSample = extractTriggerHints(sampleMenuDigest);
        List<String> codePatternsSample = extractCodePatternsFromText(sampleCodeDigest);
        List<String> assumptions = new ArrayList<>();
        List<String> risks = new ArrayList<>();
        if (scenario == InputScenario.A_GREENFIELD) {
            assumptions.add("Modules/tables inferred from USER_REQUEST + LIVE_APP_MENU + TENANT_RAG — not Java templates");
            if (modules.isEmpty()) {
                risks.add("Comprehend LLM did not return modules — worker must parse USER_REQUEST directly");
            }
        } else if (scenario == InputScenario.C_EDIT_EXISTING) {
            assumptions.add("Giữ cấu trúc nghiệp vụ hiện có — chỉ sửa theo user_delta");
            risks.add("Menu/code lớn — worker nhận digest + plan slices");
        }
        if (menuFlow && menuScan != null && menuScan.totalNodes() > 0) {
            if (!menuScan.nodesMissingI18n().isEmpty()) {
                risks.add("Thiếu i18n label tại "
                    + menuScan.nodesMissingI18n().size() + " node: "
                    + String.join(", ", menuScan.nodesMissingI18n().stream().limit(5).toList()));
            }
            if (!menuScan.emptyTriggerNodeIds().isEmpty()) {
                risks.add("Trigger rỗng/thiếu tại "
                    + menuScan.emptyTriggerNodeIds().size() + " node form/list");
            }
            if (menuScan.tableColumnI18nGaps() > 0) {
                risks.add("Cột bảng thiếu label_en/label_zh: ~" + menuScan.tableColumnI18nGaps() + " cột");
            }
        }
        if (modules.isEmpty()) {
            modules = List.of();
        }
        String summary = menuFlow
            ? extractGreenfieldRootTitle(userRequest)
            : trimToMax(userRequest, 400);
        if (summary.isBlank() && menuFlow) {
            summary = modules.isEmpty()
                ? trimToMax("Menu CSM greenfield: " + userRequest, 400)
                : "Menu CSM: " + String.join(", ", modules.stream().limit(6).toList());
        } else if (summary.isBlank() && !menuFlow) {
            summary = modules.isEmpty()
                ? trimToMax("DynamicCode: " + userRequest, 400)
                : "DynamicCode CSM: " + String.join(", ", modules.stream().limit(6).toList());
        }
        if (!tables.isEmpty()) {
            summary = summary + " | bảng: " + String.join(", ", tables.stream().limit(6).toList());
        }
        if (!existingSummary.isBlank() && scenario == InputScenario.C_EDIT_EXISTING) {
            summary = summary + " | hiện trạng: " + trimToMax(existingSummary, 280);
        }
        return new BusinessSpec(
            summary,
            existingSummary,
            modules,
            tables,
            flows,
            List.of(),
            triggersSample,
            triggersCurrent,
            codePatternsSample,
            codePatternsCurrent,
            trimToMax(userRequest, 500),
            assumptions,
            risks);
    }

    private String buildMenuExistingSummary(MenuBusinessScan scan, String digestFallback) {
        StringBuilder sb = new StringBuilder();
        sb.append("Menu ").append(scan.totalNodes()).append(" node");
        if (!scan.moduleLabels().isEmpty()) {
            sb.append("; module: ").append(String.join(", ", scan.moduleLabels().stream().limit(6).toList()));
        }
        if (!scan.tables().isEmpty()) {
            sb.append("; bảng: ").append(String.join(", ", scan.tables().stream().limit(8).toList()));
        }
        if (!scan.typeFormCounts().isEmpty()) {
            sb.append("; ").append(formatTypeFormCounts(scan.typeFormCounts()));
        }
        if (!scan.triggerSummaries().isEmpty()) {
            sb.append("; trigger: ")
                .append(String.join("; ", scan.triggerSummaries().stream().limit(4).toList()));
        }
        if (!scan.nodesMissingI18n().isEmpty()) {
            sb.append("; thiếu i18n: ")
                .append(String.join(", ", scan.nodesMissingI18n().stream().limit(6).toList()));
        }
        if (!scan.emptyTriggerNodeIds().isEmpty()) {
            sb.append("; trigger trống: ")
                .append(String.join(", ", scan.emptyTriggerNodeIds().stream().limit(6).toList()));
        }
        String built = sb.toString().trim();
        if (built.length() < 80 && !String.valueOf(digestFallback == null ? "" : digestFallback).isBlank()) {
            built = built + " | " + trimToMax(digestFallback, 800);
        }
        return trimToMax(built, 1200);
    }

    private String buildCodeExistingSummary(CodeBusinessScan scan, String digestFallback) {
        StringBuilder sb = new StringBuilder();
        if (!scan.symbols().isEmpty()) {
            sb.append("Hàm/UI chính: ").append(String.join(", ", scan.symbols().stream().limit(8).toList()));
        }
        if (!scan.tables().isEmpty()) {
            sb.append("; bảng: ").append(String.join(", ", scan.tables().stream().limit(6).toList()));
        }
        if (!scan.apiPatterns().isEmpty()) {
            sb.append("; API: ").append(String.join(", ", scan.apiPatterns()));
        }
        if (!scan.lifecyclePatterns().isEmpty()) {
            sb.append("; lifecycle: ").append(String.join(", ", scan.lifecyclePatterns()));
        }
        String built = sb.toString().trim();
        if (built.length() < 60 && !String.valueOf(digestFallback == null ? "" : digestFallback).isBlank()) {
            built = trimToMax(digestFallback, 1200);
        }
        return trimToMax(built, 1200);
    }

    private List<String> inferBusinessModulesFromCodeScan(CodeBusinessScan scan) {
        List<String> modules = new ArrayList<>();
        if (scan == null || scan.symbols() == null) {
            return modules;
        }
        for (String sym : scan.symbols()) {
            if (sym == null || sym.isBlank()) {
                continue;
            }
            if (sym.startsWith("Fallback") || sym.equals("onKeyDown") || sym.equals("allow")) {
                continue;
            }
            modules.add(sym);
            if (modules.size() >= 8) {
                break;
            }
        }
        return modules;
    }

    private String formatTypeFormCounts(Map<String, Integer> counts) {
        if (counts == null || counts.isEmpty()) {
            return "";
        }
        List<String> parts = new ArrayList<>();
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            parts.add("tf" + e.getKey() + "=" + e.getValue());
        }
        return String.join(", ", parts);
    }

    private List<String> mergeStringLists(List<String> first, List<String> second) {
        LinkedHashSet<String> merged = new LinkedHashSet<>();
        if (first != null) {
            merged.addAll(first);
        }
        if (second != null) {
            merged.addAll(second);
        }
        return new ArrayList<>(merged);
    }

    private ExecutionPlan buildExecutionPlan(
        BusinessSpec spec,
        String operationScenario,
        boolean menuFlow,
        boolean greenfield,
        AiEditTaskPlannerService.EditTaskPlan editTaskPlan,
        String userMessage,
        MenuBusinessScan menuScan,
        String responseMode,
        CodeBusinessScan codeScan
    ) {
        String safeMode = String.valueOf(responseMode == null ? "" : responseMode).trim().toLowerCase(Locale.ROOT);
        if ("analyze".equals(safeMode)) {
            return buildAnalyzeExecutionPlan(spec, operationScenario, menuFlow, userMessage, codeScan);
        }
        List<ExecutionStep> steps = new ArrayList<>();
        int idx = 1;
        String msgLower = String.valueOf(userMessage == null ? "" : userMessage).toLowerCase(Locale.ROOT);

        if (!greenfield && menuFlow) {
            boolean wantTrigger = msgLower.contains("trigger") || msgLower.contains("nghiệp vụ")
                || msgLower.contains("nghiep vu") || msgLower.contains("filter") || msgLower.contains("load_db");
            boolean hasEmptyTriggers = menuScan != null && !menuScan.emptyTriggerNodeIds().isEmpty();
            if (wantTrigger || hasEmptyTriggers) {
                steps.add(new ExecutionStep(
                    "s" + idx++,
                    "audit_and_patch_triggers",
                    hasEmptyTriggers
                        ? "nodes_missing_trigger:" + String.join(",", menuScan.emptyTriggerNodeIds().stream().limit(8).toList())
                        : "all_menu_nodes",
                    List.of("trigger.filter", "trigger.load_db", "trigger.update")));
            }
            boolean wantI18n = msgLower.contains("ngôn ngữ") || msgLower.contains("ngon ngu") || msgLower.contains("label")
                || msgLower.contains("i18n") || msgLower.contains("en") || msgLower.contains("zh");
            boolean hasI18nGaps = menuScan != null && !menuScan.nodesMissingI18n().isEmpty();
            if (wantI18n || hasI18nGaps) {
                steps.add(new ExecutionStep(
                    "s" + idx++,
                    "enrich_i18n_labels",
                    hasI18nGaps
                        ? "nodes:" + String.join(",", menuScan.nodesMissingI18n().stream().limit(8).toList())
                        : "menu_nodes_and_table_columns",
                    List.of("label", "label_en", "label_zh", "f_label", "f_label_en", "f_label_zh")));
            }
            boolean wantColumns = msgLower.contains("cột") || msgLower.contains("cot") || msgLower.contains("bảng")
                || msgLower.contains("bang") || msgLower.contains("table");
            boolean hasColumnGaps = menuScan != null && menuScan.tableColumnI18nGaps() > 0;
            if (wantColumns || hasColumnGaps) {
                steps.add(new ExecutionStep(
                    "s" + idx++,
                    "patch_table_columns",
                    "table[]",
                    List.of("f_types", "f_header", "f_cbo_query", "f_show", "f_label_en", "f_label_zh")));
            }
        }

        if (spec.modules() != null && steps.size() < 6) {
            for (String module : spec.modules()) {
                if (module == null || module.isBlank()) {
                    continue;
                }
                steps.add(new ExecutionStep(
                    "s" + idx++,
                    greenfield
                        ? (menuFlow ? "create_menu_module" : "implement_code_region")
                        : "incremental_edit_module",
                    module.trim(),
                    menuFlow ? List.of("type_form", "table_name", "trigger", "i18n") : List.of("ctx.helperApi", "lifecycle")));
                if (steps.size() >= 8) {
                    break;
                }
            }
        }
        if (editTaskPlan != null && editTaskPlan.enabled() && editTaskPlan.slices() != null) {
            for (AiEditTaskPlannerService.EditTaskSlice slice : editTaskPlan.slices()) {
                if (slice == null || steps.size() >= 8) {
                    break;
                }
                steps.add(new ExecutionStep(
                    "s" + idx++,
                    "textEdits",
                    slice.objective(),
                    slice.symbols() == null ? List.of() : slice.symbols()));
            }
        }
        if (steps.isEmpty()) {
            steps.add(new ExecutionStep(
                "s1",
                greenfield ? (menuFlow ? "full_menu_tree" : "full_code_scaffold") : "incremental_edit",
                menuFlow ? "root_menu" : "editor_surface",
                List.of()));
        }
        String outputContract = greenfield
            ? (menuFlow ? "full_menu_json" : "full_code_envelope")
            : (menuFlow ? "patches_or_full_tree" : "textEdits");
        List<String> acceptance = new ArrayList<>();
        acceptance.add("Khớp yêu cầu user: " + trimToMax(spec.userDelta(), 120));
        if (spec.existingBusinessSummary() != null && !spec.existingBusinessSummary().isBlank()) {
            acceptance.add("Không phá nghiệp vụ hiện có: " + trimToMax(spec.existingBusinessSummary(), 100));
        }
        if (spec.triggersFromCurrentEditor() != null && !spec.triggersFromCurrentEditor().isEmpty()) {
            acceptance.add("Giữ trigger hiện có trừ khi user yêu cầu sửa");
        }
        if (!spec.triggersLearnedFromSample().isEmpty()) {
            acceptance.add("Trigger bám mẫu: " + String.join(", ", spec.triggersLearnedFromSample().stream().limit(3).toList()));
        }
        acceptance.add("Label vi/en/zh đủ 3 ngôn ngữ (menu) hoặc pattern ctx.helperApi (code)");
        return new ExecutionPlan(
            operationScenario.isBlank() ? (greenfield ? "new_build" : "incremental_update") : operationScenario,
            steps,
            outputContract,
            acceptance);
    }

    private ExecutionPlan buildAnalyzeExecutionPlan(
        BusinessSpec spec,
        String operationScenario,
        boolean menuFlow,
        String userMessage,
        CodeBusinessScan codeScan
    ) {
        List<ExecutionStep> steps = new ArrayList<>();
        steps.add(new ExecutionStep(
            "a1",
            "summarize_business_purpose",
            menuFlow ? "menu_editor" : "code_editor",
            List.of("domain", "user_goal")));
        steps.add(new ExecutionStep(
            "a2",
            "map_data_and_control_flow",
            "editor_surface",
            List.of("load", "save", "branch", "state")));
        if (codeScan != null && !codeScan.lifecyclePatterns().isEmpty()) {
            steps.add(new ExecutionStep(
                "a3",
                "explain_lifecycle_and_integrations",
                String.join(",", codeScan.lifecyclePatterns().stream().limit(4).toList()),
                codeScan.apiPatterns() == null ? List.of() : codeScan.apiPatterns().stream().limit(4).toList()));
        } else {
            steps.add(new ExecutionStep(
                "a3",
                "explain_side_effects_and_outputs",
                "editor_surface",
                List.of("api", "persistence", "ui")));
        }
        List<String> acceptance = new ArrayList<>();
        acceptance.add("Trả lời prose tiếng Việt — không JSON, không textEdits, không lặp block nội bộ");
        acceptance.add("Giải thích nghiệp vụ/luồng xử lý dựa trên code đã quét");
        if (spec != null && spec.userDelta() != null && !spec.userDelta().isBlank()) {
            acceptance.add("Trả lời đúng câu hỏi: " + trimToMax(spec.userDelta(), 120));
        }
        return new ExecutionPlan(
            operationScenario.isBlank() ? "business_analysis" : operationScenario,
            steps,
            "analyze_prose_vi",
            acceptance);
    }

    public String buildAnalyzeBusinessPromptBlock(
        BusinessSpec spec,
        ExecutionPlan plan,
        CodeBusinessScan codeScan,
        boolean menuFlow,
        int maxChars
    ) {
        if (spec == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("## BUSINESS_CONTEXT (internal — do NOT copy into answer)\n");
        sb.append("Purpose: ").append(inferAnalyzeBusinessPurpose(spec, codeScan, menuFlow)).append("\n");
        if (spec.existingBusinessSummary() != null && !spec.existingBusinessSummary().isBlank()) {
            sb.append("Editor business: ").append(trimToMax(spec.existingBusinessSummary(), 600)).append("\n");
        }
        if (spec.flows() != null && !spec.flows().isEmpty()) {
            sb.append("Flows: ").append(String.join(" | ", spec.flows().stream().limit(4).toList())).append("\n");
        }
        if (codeScan != null && !codeScan.tables().isEmpty()) {
            sb.append("Tables: ").append(String.join(", ", codeScan.tables().stream().limit(6).toList())).append("\n");
        }
        if (!spec.userDelta().isBlank()) {
            sb.append("User question: ").append(spec.userDelta()).append("\n");
        }
        sb.append("Answer contract: Vietnamese prose explaining business logic (4–6 sections). ");
        sb.append("Do NOT repeat this block, Steps, Output contract, or ASSUMPTIONS/RISKS.\n");
        sb.append("[/BUSINESS_CONTEXT]\n");
        return trimToMax(sb.toString(), Math.max(700, maxChars));
    }

    private String inferAnalyzeBusinessPurpose(BusinessSpec spec, CodeBusinessScan codeScan, boolean menuFlow) {
        String domain = spec == null ? "" : String.valueOf(spec.domainSummary() == null ? "" : spec.domainSummary()).trim();
        if (!domain.isBlank()) {
            return domain;
        }
        if (menuFlow) {
            return "Menu CSM — điều hướng theo type_form, table[], trigger (learned from LIVE_APP_MENU + USER_REQUEST)";
        }
        return "DynamicCode — UI/tương tác theo pattern code hiện có + USER_REQUEST";
    }

    public String buildWorkerPromptBlock(
        BusinessSpec spec,
        ExecutionPlan plan,
        int maxChars,
        String tenantRag,
        String sampleMenuDigest
    ) {
        if (spec == null || plan == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("## BUSINESS_COMPREHENSION (internal — follow strictly)\n");
        sb.append("Lego rule: STRUCTURE from ai_menu_structure_runtime (type_form,f_*,saveMenuStruct).\n");
        sb.append("BUSINESS modules/tables ONLY from USER delta + planned_structure — never fixed ERP template.\n");
        sb.append("Domain: ").append(spec.domainSummary()).append("\n");
        if (spec.existingBusinessSummary() != null && !spec.existingBusinessSummary().isBlank()) {
            sb.append("Existing business (editor): ").append(trimToMax(spec.existingBusinessSummary(), 500)).append("\n");
        }
        if (spec.flows() != null && !spec.flows().isEmpty()) {
            sb.append("Flows: ").append(String.join("; ", spec.flows().stream().limit(4).toList())).append("\n");
        }
        if (spec.plannedStructure() != null && !spec.plannedStructure().isEmpty()) {
            sb.append("Planned Lego (module → piece):\n");
            int n = 0;
            for (Map<String, Object> row : spec.plannedStructure()) {
                if (row == null || n >= 8) {
                    break;
                }
                sb.append("- ").append(String.valueOf(row.getOrDefault("module", "")))
                    .append(" → ").append(String.valueOf(row.getOrDefault("lego_piece", "")))
                    .append(" type_form=").append(String.valueOf(row.getOrDefault("type_form", "")))
                    .append("\n");
                n++;
            }
        }
        if (spec.modules() != null && !spec.modules().isEmpty()) {
            sb.append("Modules: ").append(String.join(", ", spec.modules().stream().limit(8).toList())).append("\n");
        }
        if (spec.tables() != null && !spec.tables().isEmpty()) {
            sb.append("Tables: ").append(String.join(", ", spec.tables().stream().limit(8).toList())).append("\n");
        }
        if (!spec.userDelta().isBlank()) {
            sb.append("User delta: ").append(spec.userDelta()).append("\n");
        }
        if (spec.triggersFromCurrentEditor() != null && !spec.triggersFromCurrentEditor().isEmpty()) {
            sb.append("Triggers from current editor: ")
                .append(String.join("; ", spec.triggersFromCurrentEditor().stream().limit(5).toList()))
                .append("\n");
        }
        if (spec.triggersLearnedFromSample() != null && !spec.triggersLearnedFromSample().isEmpty()) {
            sb.append("Triggers from sample: ")
                .append(String.join("; ", spec.triggersLearnedFromSample().stream().limit(5).toList()))
                .append("\n");
        }
        if (spec.codePatternsFromSample() != null && !spec.codePatternsFromSample().isEmpty()) {
            sb.append("Code patterns from sample: ")
                .append(String.join(", ", spec.codePatternsFromSample().stream().limit(6).toList()))
                .append("\n");
        }
        sb.append("Plan scenario: ").append(plan.scenario()).append("\n");
        sb.append("Output contract: ").append(plan.outputContract()).append("\n");
        if (plan.steps() != null && !plan.steps().isEmpty()) {
            sb.append("Steps:\n");
            int n = 0;
            for (ExecutionStep step : plan.steps()) {
                if (step == null || n >= 6) {
                    break;
                }
                sb.append("- ").append(step.id()).append(": ")
                    .append(step.action()).append(" → ").append(step.target()).append("\n");
                n++;
            }
        }
        if (spec.assumptions() != null && !spec.assumptions().isEmpty()) {
            sb.append("Assumptions: ").append(String.join("; ", spec.assumptions())).append("\n");
        }
        if (spec.risks() != null && !spec.risks().isEmpty()) {
            sb.append("Risks: ").append(String.join("; ", spec.risks())).append("\n");
        }
        String learnedRag = String.valueOf(tenantRag == null ? "" : tenantRag).trim();
        if (!learnedRag.isBlank()) {
            sb.append("Learned tenant patterns (RAG): ").append(trimToMax(learnedRag, 900)).append("\n");
        }
        String learnedMenu = String.valueOf(sampleMenuDigest == null ? "" : sampleMenuDigest).trim();
        if (!learnedMenu.isBlank()) {
            sb.append("Sample menu patterns: ").append(trimToMax(learnedMenu, 700)).append("\n");
        }
        sb.append("[/BUSINESS_COMPREHENSION]\n");
        return trimToMax(sb.toString(), Math.max(800, maxChars));
    }

    /** Backward-compatible overload for callers without RAG context. */
    public String buildWorkerPromptBlock(BusinessSpec spec, ExecutionPlan plan, int maxChars) {
        return buildWorkerPromptBlock(spec, plan, maxChars, "", "");
    }

    public List<Map<String, Object>> extractSampleAttachmentsForIngest(List<Map<String, Object>> attachments) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (attachments == null) {
            return out;
        }
        for (Map<String, Object> att : attachments) {
            if (att == null || att.isEmpty()) {
                continue;
            }
            String role = str(att.get("contextRole")).toLowerCase(Locale.ROOT);
            if (SAMPLE_ATTACHMENT_ROLES.contains(role) || Boolean.TRUE.equals(att.get("authoritative"))) {
                out.add(att);
            }
        }
        return out;
    }

    private String extractSampleMenuDigest(
        List<Map<String, Object>> attachments,
        String message,
        Map<String, Object> editorMetadata
    ) {
        StringBuilder sb = new StringBuilder();
        if (attachments != null) {
            for (Map<String, Object> att : attachments) {
                String role = str(att.get("contextRole")).toLowerCase(Locale.ROOT);
                if (!"legacy_json".equals(role) && !isJsonAttachment(att)) {
                    continue;
                }
                String body = attachmentText(att);
                if (!body.isBlank()) {
                    sb.append(compactMenuDigest(body)).append("\n");
                }
            }
        }
        String fromMessage = extractJsonFieldFromMessage(message, "sample_menu_compact");
        if (!fromMessage.isBlank()) {
            sb.append(fromMessage).append("\n");
        }
        if (editorMetadata != null) {
            Object compact = editorMetadata.get("sample_menu_compact");
            if (compact != null) {
                sb.append(String.valueOf(compact)).append("\n");
            }
        }
        return trimToMax(sb.toString().trim(), sampleMenuDigestMaxChars);
    }

    private String extractSampleCodeDigest(
        List<Map<String, Object>> attachments,
        String message,
        boolean menuFlow
    ) {
        StringBuilder sb = new StringBuilder();
        if (attachments != null) {
            for (Map<String, Object> att : attachments) {
                String role = str(att.get("contextRole")).toLowerCase(Locale.ROOT);
                boolean isSampleCode = "reference_code".equals(role)
                    || "business_logic".equals(role)
                    || (!menuFlow && isCodeAttachment(att));
                if (!isSampleCode) {
                    continue;
                }
                String body = attachmentText(att);
                if (!body.isBlank()) {
                    sb.append(compactCodeDigest(body)).append("\n");
                }
            }
        }
        return trimToMax(sb.toString().trim(), sampleCodeDigestMaxChars);
    }

    private String compactMenuDigest(String raw) {
        String text = String.valueOf(raw == null ? "" : raw).trim();
        if (text.length() <= sampleMenuDigestMaxChars) {
            return text;
        }
        List<String> lines = new ArrayList<>();
        for (String line : text.split("\n")) {
            String l = line.trim();
            if (l.contains("type_form") || l.contains("table_name") || l.contains("trigger")
                || l.contains("\"id\"") || l.contains("menu_id") || l.contains("label")) {
                lines.add(l);
            }
            if (lines.size() >= 80) {
                break;
            }
        }
        if (lines.isEmpty()) {
            return trimToMax(text, sampleMenuDigestMaxChars);
        }
        return trimToMax(String.join("\n", lines), sampleMenuDigestMaxChars);
    }

    private String compactCodeDigest(String raw) {
        String text = String.valueOf(raw == null ? "" : raw).trim();
        if (text.length() <= sampleCodeDigestMaxChars) {
            return text;
        }
        LinkedHashSet<String> symbols = new LinkedHashSet<>();
        Matcher m = CODE_SYMBOL_PATTERN.matcher(text);
        while (m.find() && symbols.size() < 40) {
            String sym = m.group(2) != null ? m.group(2) : m.group(3);
            if (sym != null && !sym.isBlank()) {
                symbols.add(sym);
            }
        }
        StringBuilder sb = new StringBuilder();
        sb.append("SYMBOLS: ").append(String.join(", ", symbols)).append("\n");
        for (String anchor : List.of("ctx.helperApi", "timerRegistry", "fnResetIP", "closeAllTabs", "webview", "window.seft")) {
            int idx = text.indexOf(anchor);
            if (idx >= 0) {
                int start = Math.max(0, idx - 120);
                int end = Math.min(text.length(), idx + 280);
                sb.append("/* ").append(anchor).append(" */\n")
                    .append(text, start, end).append("\n\n");
            }
        }
        return trimToMax(sb.toString().trim(), sampleCodeDigestMaxChars);
    }

    private String extractOperationScenario(String message, boolean greenfield, boolean menuFlow) {
        String fromJson = extractJsonFieldFromMessage(message, "operation_scenario");
        if (!fromJson.isBlank()) {
            return fromJson.toLowerCase(Locale.ROOT);
        }
        if (greenfield && menuFlow) {
            return "new_build";
        }
        return greenfield ? "new_build" : "incremental_update";
    }

    private String specTableName(String moduleName, int index) {
        if (moduleName != null && moduleName.toLowerCase(Locale.ROOT).contains("config")) {
            return "m_configs";
        }
        return "tbl_module_" + index;
    }

    private String buildDeterministicCodeSeed(BusinessSpec spec) {
        String module = spec.modules() != null && !spec.modules().isEmpty()
            ? spec.modules().get(0)
            : "Module";
        String code = """
            // CSM DynamicCode greenfield scaffold (PHẦN AC deterministic fallback)
            (function initDynamicCodeScaffold() {
              if (typeof window !== 'undefined' && window.__CSM_DC_SCAFFOLD_LOADED__) {
                return;
              }
              if (typeof window !== 'undefined') {
                window.__CSM_DC_SCAFFOLD_LOADED__ = true;
              }
              window.seft = window.seft || {};
              var ctx = window.seft;
              ctx.helperApi = ctx.helperApi || {};

              function resolveContainer() {
                var id = ctx.containerId || window.csmDynamicCodeContainerId || 'context-auto';
                return document.getElementById(id)
                  || document.getElementById('context-auto')
                  || document.getElementById('dynamic-code-root');
              }

              function init_%s() {
                var container = resolveContainer();
                if (!container) {
                  console.warn('[DynamicCode] container not found');
                  return;
                }
                // TODO: bind grid/form per BusinessSpec — module: %s
              }

              function load_%s() {
                if (window.csmApi && typeof window.csmApi.getTableData === 'function') {
                  return window.csmApi.getTableData({ app_id: ctx.appId || ctx.app_id, obj_name: '%s' });
                }
                return Promise.resolve({ rows: [] });
              }

              init_%s();
              window.__dynamicCodeDispose = function () {
                if (typeof window !== 'undefined') {
                  window.__CSM_DC_SCAFFOLD_LOADED__ = false;
                }
              };
            })();
            """.formatted(
            sanitizeSymbol(module),
            module.replace("\"", "'"),
            sanitizeSymbol(module),
            specTableName(module, 1),
            sanitizeSymbol(module));
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("code", code);
        envelope.put("summary", "Greenfield scaffold: " + module);
        envelope.put("changes", List.of("Added CSM header + init/load stubs"));
        try {
            return objectMapper.writeValueAsString(envelope);
        } catch (Exception ex) {
            return "{\"code\":\"" + code.replace("\"", "\\\"") + "\"}";
        }
    }

    private String sanitizeSymbol(String raw) {
        String s = String.valueOf(raw == null ? "Module" : raw)
            .replaceAll("[^A-Za-z0-9_]", "_");
        if (s.isBlank() || Character.isDigit(s.charAt(0))) {
            s = "M_" + s;
        }
        return s;
    }

    /** Extract module names from LIVE_APP_MENU tree lines + user requirement segments — no ERP keyword map. */
    private List<String> extractModulesFromLearnedContext(
        String userRequest,
        String sampleMenuDigest,
        MenuBusinessScan menuScan
    ) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (menuScan != null && menuScan.totalNodes() > 0) {
            for (String label : menuScan.moduleLabels()) {
                if (!String.valueOf(label == null ? "" : label).trim().isBlank()) {
                    out.add(label.trim());
                }
            }
        }
        String digest = String.valueOf(sampleMenuDigest == null ? "" : sampleMenuDigest);
        for (String line : digest.split("\n")) {
            int labelIdx = line.indexOf("| label=");
            if (labelIdx >= 0) {
                String label = line.substring(labelIdx + 8).trim();
                int pipe = label.indexOf('|');
                if (pipe > 0) {
                    label = label.substring(0, pipe).trim();
                }
                if (!label.isBlank() && !"?".equals(label)) {
                    out.add(label);
                }
            }
            if (line.contains("; module: ")) {
                String part = line.substring(line.indexOf("; module: ") + 10);
                for (String m : part.split(",")) {
                    String t = m.trim();
                    if (!t.isBlank()) {
                        out.add(t);
                    }
                }
            }
        }
        for (String segment : splitRequirementSegments(userRequest)) {
            if (segment.length() >= 4 && segment.length() <= 80) {
                out.add(segment.trim());
            }
        }
        return new ArrayList<>(out).stream().limit(12).toList();
    }

    private List<String> splitRequirementSegments(String text) {
        List<String> segments = new ArrayList<>();
        String safe = String.valueOf(text == null ? "" : text).trim();
        if (safe.isBlank() || looksLikeJsonMenuEnvelope(safe)) {
            return segments;
        }
        for (String part : safe.split("[\\n,;•]+")) {
            String cleaned = part.trim();
            if (cleaned.length() < 4) {
                continue;
            }
            String lower = cleaned.toLowerCase(Locale.ROOT);
            if (looksLikeJsonMenuEnvelope(cleaned) || cleaned.startsWith("{") || cleaned.startsWith("[")) {
                continue;
            }
            if (lower.contains("json menu") || lower.contains("viết đầy đủ") || lower.contains("viet day du")
                || lower.contains("cho tôi") || lower.contains("chương trình quản lý")
                || lower.contains("báo cáo đầy đủ") || lower.contains("bao cao day du")
                || lower.contains("theo dõi kết quả") || lower.contains("theo doi ket qua")) {
                continue;
            }
            segments.add(cleaned.length() > 72 ? cleaned.substring(0, 69) + "..." : cleaned);
            if (segments.size() >= 10) {
                break;
            }
        }
        return segments;
    }

    private boolean looksLikeJsonMenuEnvelope(String text) {
        String t = String.valueOf(text == null ? "" : text).trim();
        if (!t.startsWith("{") && !t.startsWith("[")) {
            return false;
        }
        String lower = t.toLowerCase(Locale.ROOT);
        return lower.contains("\"menu\"")
            || (lower.contains("\"children\"") && lower.contains("type_form"))
            || lower.matches("\\{\\s*\"menu\"\\s*:\\s*\\[\\s*\\]\\s*\\}");
    }

    private List<String> extractTablesFromText(String text) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("\\b(m_[a-z0-9_]+|tbl_[a-z0-9_]+|sys_[a-z0-9_]+)\\b", Pattern.CASE_INSENSITIVE)
            .matcher(String.valueOf(text == null ? "" : text));
        while (m.find() && out.size() < 12) {
            out.add(m.group(1).toLowerCase(Locale.ROOT));
        }
        return out;
    }

    private List<String> extractTriggerHints(String sampleMenuDigest) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("\"trigger\"\\s*:\\s*\\{[^}]{0,200}\\}", Pattern.CASE_INSENSITIVE)
            .matcher(String.valueOf(sampleMenuDigest == null ? "" : sampleMenuDigest));
        while (m.find() && out.size() < 5) {
            out.add(m.group().replaceAll("\\s+", " "));
        }
        return out;
    }

    private List<String> extractCodePatternsFromText(String sampleCodeDigest) {
        List<String> out = new ArrayList<>();
        String text = String.valueOf(sampleCodeDigest == null ? "" : sampleCodeDigest);
        Matcher m = Pattern.compile("(window\\.seft|ctx\\.helperApi|timerRegistry|fnResetIP|closeAllTabs|webview|__AUTO_[A-Z0-9_]+__)")
            .matcher(text);
        while (m.find() && out.size() < 10) {
            out.add(m.group(1));
        }
        return out;
    }

    private String extractJsonFieldFromMessage(String message, String field) {
        if (message == null || message.isBlank() || !message.contains(field) || objectMapper == null) {
            return "";
        }
        try {
            if (message.trim().startsWith("{")) {
                JsonNode root = objectMapper.readTree(message.trim());
                JsonNode node = root.at("/app_id_specific_metadata/" + field);
                if (node.isMissingNode()) {
                    node = root.get(field);
                }
                if (node.isTextual()) {
                    return node.asText("");
                }
                if (node.isArray() || node.isObject()) {
                    return objectMapper.writeValueAsString(node);
                }
            }
        } catch (Exception ignored) {
            // not JSON message
        }
        return "";
    }

    private String extractJsonObject(String raw) {
        String text = String.valueOf(raw == null ? "" : raw).trim();
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return text.substring(start, end + 1);
        }
        return "";
    }

    private List<String> readStringList(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return out;
        }
        for (JsonNode item : node) {
            String v = item.asText("").trim();
            if (!v.isBlank()) {
                out.add(v);
            }
        }
        return out;
    }

    private List<Map<String, Object>> readPlannedStructureList(JsonNode node) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (node == null || !node.isArray() || objectMapper == null) {
            return out;
        }
        for (JsonNode item : node) {
            if (item == null || !item.isObject()) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("module", item.path("module").asText("").trim());
            row.put("lego_piece", item.path("lego_piece").asText("").trim());
            if (item.has("type_form")) {
                row.put("type_form", item.get("type_form").isNumber()
                    ? item.get("type_form").asInt()
                    : item.path("type_form").asText("").trim());
            }
            row.put("parent_group", item.path("parent_group").asText("").trim());
            row.put("table_name_hint", item.path("table_name_hint").asText("").trim());
            row.put("notes", item.path("notes").asText("").trim());
            if (!String.valueOf(row.get("module")).isBlank()) {
                out.add(row);
            }
        }
        return out;
    }

    private String attachmentText(Map<String, Object> att) {
        String text = str(att.get("textContent"));
        if (text.isBlank()) {
            text = str(att.get("content"));
        }
        return text;
    }

    private boolean isJsonAttachment(Map<String, Object> att) {
        String kind = str(att.get("kind")).toLowerCase(Locale.ROOT);
        String name = str(att.get("name")).toLowerCase(Locale.ROOT);
        return "json".equals(kind) || name.endsWith(".json");
    }

    private boolean isCodeAttachment(Map<String, Object> att) {
        String name = str(att.get("name")).toLowerCase(Locale.ROOT);
        return name.endsWith(".js") || name.endsWith(".ts") || "reference_code".equals(str(att.get("contextRole")));
    }

    private String trimToMax(String text, int max) {
        String safe = String.valueOf(text == null ? "" : text);
        if (safe.length() <= max) {
            return safe;
        }
        return safe.substring(0, max) + "\n...[truncated]";
    }

    private String str(Object o) {
        return String.valueOf(o == null ? "" : o).trim();
    }

    private String extractActiveEditorDigest(String currentCode, boolean menuFlow) {
        String code = String.valueOf(currentCode == null ? "" : currentCode).trim();
        if (code.isBlank()) {
            return "";
        }
        return menuFlow ? extractActiveMenuDigest(code) : compactCodeDigest(code);
    }

    private String extractActiveMenuDigest(String raw) {
        MenuBusinessScan scan = scanMenuBusinessStructure(raw);
        List<Map<String, Object>> roots = parseMenuRoots(raw);
        StringBuilder sb = new StringBuilder();
        if (scan.totalNodes() > 0) {
            sb.append("CURRENT_MENU_BUSINESS_DIGEST\n");
            sb.append(buildMenuExistingSummary(scan, "")).append("\n");
            if (!scan.typeFormCounts().isEmpty()) {
                sb.append("TYPE_FORMS: ").append(formatTypeFormCounts(scan.typeFormCounts())).append("\n");
            }
        }
        if (roots.isEmpty()) {
            if (sb.isEmpty()) {
                return compactMenuDigest(raw);
            }
            sb.append("RAW_FALLBACK:\n").append(compactMenuDigest(raw));
            return trimToMax(sb.toString().trim(), activeEditorDigestMaxChars);
        }
        sb.append("NODE_SAMPLES:\n");
        walkMenuDigestNodes(roots, sb, 0, 0, 120);
        return trimToMax(sb.toString().trim(), activeEditorDigestMaxChars);
    }

    private MenuBusinessScan scanMenuBusinessStructure(String raw) {
        List<Map<String, Object>> roots = parseMenuRoots(raw);
        if (roots.isEmpty()) {
            return MenuBusinessScan.empty();
        }
        LinkedHashSet<String> moduleLabels = new LinkedHashSet<>();
        LinkedHashSet<String> tables = new LinkedHashSet<>();
        List<String> triggerSummaries = new ArrayList<>();
        List<String> nodesMissingI18n = new ArrayList<>();
        List<String> emptyTriggerNodeIds = new ArrayList<>();
        Map<String, Integer> typeFormCounts = new LinkedHashMap<>();
        int[] columnI18nGaps = {0};
        int[] totalNodes = {0};
        scanMenuNodesRecursive(roots, moduleLabels, tables, triggerSummaries, nodesMissingI18n,
            emptyTriggerNodeIds, typeFormCounts, columnI18nGaps, totalNodes, 0, 2500);
        return new MenuBusinessScan(
            new ArrayList<>(moduleLabels),
            new ArrayList<>(tables),
            triggerSummaries,
            nodesMissingI18n,
            emptyTriggerNodeIds,
            totalNodes[0],
            columnI18nGaps[0],
            typeFormCounts);
    }

    @SuppressWarnings("unchecked")
    private void scanMenuNodesRecursive(
        List<?> nodes,
        LinkedHashSet<String> moduleLabels,
        LinkedHashSet<String> tables,
        List<String> triggerSummaries,
        List<String> nodesMissingI18n,
        List<String> emptyTriggerNodeIds,
        Map<String, Integer> typeFormCounts,
        int[] columnI18nGaps,
        int[] totalNodes,
        int depth,
        int maxNodes
    ) {
        if (nodes == null || totalNodes[0] >= maxNodes) {
            return;
        }
        for (Object nodeObj : nodes) {
            if (!(nodeObj instanceof Map<?, ?> rawNode) || totalNodes[0] >= maxNodes) {
                continue;
            }
            Map<String, Object> node = (Map<String, Object>) rawNode;
            totalNodes[0]++;
            String id = str(node.get("id"));
            if (id.isBlank()) {
                id = str(node.get("menu_id"));
            }
            String label = str(node.get("label"));
            String typeForm = str(node.get("type_form"));
            if (typeForm.isBlank()) {
                typeForm = str(node.get("typeForm"));
            }
            typeFormCounts.merge(typeForm.isBlank() ? "?" : typeForm, 1, Integer::sum);

            if (depth == 0 && !label.isBlank()) {
                moduleLabels.add(label);
            } else if ("0".equals(typeForm) && !label.isBlank()) {
                moduleLabels.add(label);
            }

            String tableName = str(node.get("table_name"));
            if (tableName.isBlank()) {
                tableName = str(node.get("tableName"));
            }
            if (!tableName.isBlank()) {
                tables.add(tableName.toLowerCase(Locale.ROOT));
            }

            String labelEn = str(node.get("label_en"));
            String labelZh = str(node.get("label_zh"));
            if (!label.isBlank() && (labelEn.isBlank() || labelZh.isBlank())) {
                nodesMissingI18n.add(id.isBlank() ? label : id);
            }

            Object trigger = node.get("trigger");
            String triggerText = trigger == null ? "" : String.valueOf(trigger).trim();
            boolean needsTrigger = "1".equals(typeForm) || "2".equals(typeForm) || "6".equals(typeForm);
            if (needsTrigger && (triggerText.isBlank() || "{}".equals(triggerText) || "null".equalsIgnoreCase(triggerText))) {
                emptyTriggerNodeIds.add(id.isBlank() ? ("node@" + totalNodes[0]) : id);
            } else if (!triggerText.isBlank() && !"{}".equals(triggerText)) {
                String summary = (id.isBlank() ? "?" : id) + ":" + summarizeTriggerKeys(triggerText);
                if (triggerSummaries.size() < 24 && !triggerSummaries.contains(summary)) {
                    triggerSummaries.add(summary);
                }
            }

            scanTableColumnI18nGaps(node.get("table"), columnI18nGaps);

            Object children = node.get("children");
            if (children instanceof List<?> childList && !childList.isEmpty()) {
                scanMenuNodesRecursive(childList, moduleLabels, tables, triggerSummaries, nodesMissingI18n,
                    emptyTriggerNodeIds, typeFormCounts, columnI18nGaps, totalNodes, depth + 1, maxNodes);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void scanTableColumnI18nGaps(Object tableRaw, int[] columnI18nGaps) {
        if (!(tableRaw instanceof List<?> columns)) {
            return;
        }
        for (Object colObj : columns) {
            if (!(colObj instanceof Map<?, ?> colMap)) {
                continue;
            }
            Map<String, Object> col = (Map<String, Object>) colMap;
            String fLabel = str(col.get("f_label"));
            if (fLabel.isBlank()) {
                continue;
            }
            if (str(col.get("f_label_en")).isBlank() || str(col.get("f_label_zh")).isBlank()) {
                columnI18nGaps[0]++;
            }
        }
    }

    private String summarizeTriggerKeys(String triggerText) {
        String compact = triggerText.replaceAll("\\s+", " ");
        List<String> keys = new ArrayList<>();
        for (String key : List.of("filter", "load_db", "update", "insert", "delete", "before_open", "after_save")) {
            if (compact.contains("\"" + key + "\"") || compact.contains("'" + key + "'") || compact.contains(key + ":")) {
                keys.add(key);
            }
        }
        if (keys.isEmpty()) {
            return trimToMax(compact, 80);
        }
        return String.join(",", keys);
    }

    private CodeBusinessScan scanCodeBusinessStructure(String raw) {
        String text = String.valueOf(raw == null ? "" : raw);
        if (text.isBlank()) {
            return CodeBusinessScan.empty();
        }
        LinkedHashSet<String> symbols = new LinkedHashSet<>();
        Matcher m = CODE_SYMBOL_PATTERN.matcher(text);
        while (m.find() && symbols.size() < 32) {
            String sym = m.group(2) != null ? m.group(2) : m.group(3);
            if (sym != null && !sym.isBlank() && sym.length() > 2) {
                symbols.add(sym);
            }
        }
        List<String> tables = extractTablesFromText(text);
        List<String> lifecycle = new ArrayList<>();
        for (String anchor : List.of(
                "fnResetIP", "closeAllTabs", "timerRegistry", "window.seft", "webview",
                "csmKqxsViewOnly", "autoKqxs", "getKqxsProxyConfig", "broadcast_kqxs", "kqxs_")) {
            if (text.contains(anchor)) {
                lifecycle.add(anchor);
            }
        }
        List<String> apiPatterns = new ArrayList<>();
        for (String anchor : List.of(
                "ctx.helperApi", "ctx.api", "helperApi.", "loadCombo", "saveData",
                "helperApi", "recordManager", "loadDataToUser", "saveDataToUser")) {
            if (text.contains(anchor)) {
                apiPatterns.add(anchor);
            }
        }
        return new CodeBusinessScan(
            new ArrayList<>(symbols),
            tables,
            lifecycle,
            apiPatterns);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseMenuRoots(String raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (objectMapper == null || raw.isBlank()) {
            return out;
        }
        try {
            Object parsed = objectMapper.readValue(raw, Object.class);
            if (parsed instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) {
                        out.add((Map<String, Object>) m);
                    }
                }
            } else if (parsed instanceof Map<?, ?> map) {
                Object menu = map.get("menu");
                if (menu instanceof List<?> list) {
                    for (Object item : list) {
                        if (item instanceof Map<?, ?> m) {
                            out.add((Map<String, Object>) m);
                        }
                    }
                } else if (isLikelyMenuNodeMap(map)) {
                    out.add((Map<String, Object>) map);
                }
            }
        } catch (Exception ex) {
            log.debug("parseMenuRoots failed: {}", ex.getMessage());
        }
        return out;
    }

    private boolean isLikelyMenuNodeMap(Map<?, ?> map) {
        return map.containsKey("id") || map.containsKey("label") || map.containsKey("type_form");
    }

    @SuppressWarnings("unchecked")
    private int walkMenuDigestNodes(List<?> nodes, StringBuilder sb, int depth, int count) {
        return walkMenuDigestNodes(nodes, sb, depth, count, 80);
    }

    @SuppressWarnings("unchecked")
    private int walkMenuDigestNodes(List<?> nodes, StringBuilder sb, int depth, int count, int maxNodes) {
        if (nodes == null || count >= maxNodes) {
            return count;
        }
        for (Object nodeObj : nodes) {
            if (!(nodeObj instanceof Map<?, ?> rawNode)) {
                continue;
            }
            Map<String, Object> node = (Map<String, Object>) rawNode;
            String id = str(node.get("id"));
            String label = str(node.get("label"));
            String typeForm = str(node.get("type_form"));
            String table = str(node.get("table_name"));
            String indent = "  ".repeat(Math.min(depth, 4));
            sb.append(indent)
                .append("- id=").append(id.isBlank() ? "?" : id)
                .append(" | label=").append(label.isBlank() ? "?" : label);
            if (!typeForm.isBlank()) {
                sb.append(" | type_form=").append(typeForm);
            }
            if (!table.isBlank()) {
                sb.append(" | table=").append(table);
            }
            Object trigger = node.get("trigger");
            if (trigger != null && !String.valueOf(trigger).isBlank() && !"{}".equals(String.valueOf(trigger).trim())) {
                sb.append(" | trigger=").append(trimToMax(String.valueOf(trigger).replaceAll("\\s+", " "), 120));
            }
            String labelEn = str(node.get("label_en"));
            String labelZh = str(node.get("label_zh"));
            if (labelEn.isBlank() || labelZh.isBlank()) {
                sb.append(" | i18n_gap=en:").append(labelEn.isBlank() ? "missing" : "ok")
                    .append(",zh:").append(labelZh.isBlank() ? "missing" : "ok");
            }
            sb.append("\n");
            count++;
            Object children = node.get("children");
            if (children instanceof List<?> childList && !childList.isEmpty()) {
                count = walkMenuDigestNodes(childList, sb, depth + 1, count, maxNodes);
            }
            Object detailNodes = node.get("nodes");
            if (count < maxNodes && detailNodes instanceof List<?> nodeList && !nodeList.isEmpty()) {
                count = walkMenuDigestNodes(nodeList, sb, depth + 1, count, maxNodes);
            }
            if (count >= maxNodes) {
                break;
            }
        }
        return count;
    }

    private String resolveSystemMasterDigest(String appId, boolean menuFlow) {
        if (aiAssistantGatewayService == null) {
            return "";
        }
        return aiAssistantGatewayService.buildSystemMasterDigestCompact(
            appId,
            menuFlow,
            systemMasterDigestMaxChars);
    }

    private String resolveLearnedMenuSampleDigest(String appId, String userRequest) {
        StringBuilder sb = new StringBuilder();
        String livePatterns = resolveLiveAppMenuPatternDigest(appId);
        if (!livePatterns.isBlank()) {
            sb.append(livePatterns).append("\n---\n");
        }
        if (aiBusinessMemoryVectorService == null || appId == null || appId.isBlank()) {
            return trimToMax(sb.toString().trim(), sampleMenuDigestMaxChars);
        }
        String query = String.valueOf(userRequest == null ? "" : userRequest).trim();
        if (query.isBlank()) {
            query = "menu type_form table trigger CSM";
        }
        try {
            List<AiBusinessMemoryVectorService.SearchHit> hits = aiBusinessMemoryVectorService.searchWithScopes(
                appId,
                query,
                5,
                AiScopedContextIngestionService.SCOPE_MENU);
            if (hits == null || hits.isEmpty()) {
                hits = aiBusinessMemoryVectorService.search(appId, query, 5);
            }
            for (AiBusinessMemoryVectorService.SearchHit hit : hits) {
                if (hit == null) {
                    continue;
                }
                String text = !hit.content().isBlank() ? hit.content() : hit.summary();
                if (text == null || text.isBlank()) {
                    continue;
                }
                if (!text.contains("type_form") && !text.contains("menu") && !text.contains("f_name")) {
                    continue;
                }
                sb.append("RAG_PATTERN:\n").append(text.trim()).append("\n---\n");
            }
            return trimToMax(sb.toString().trim(), sampleMenuDigestMaxChars);
        } catch (Exception ex) {
            log.debug("Learned menu sample digest failed: {}", ex.getMessage());
            return trimToMax(sb.toString().trim(), sampleMenuDigestMaxChars);
        }
    }

    private String resolveLearnedCodeSampleDigest(String appId, String userRequest) {
        StringBuilder sb = new StringBuilder();
        if (aiBusinessMemoryVectorService == null || appId == null || appId.isBlank()) {
            return trimToMax(sb.toString().trim(), sampleCodeDigestMaxChars);
        }
        String query = String.valueOf(userRequest == null ? "" : userRequest).trim();
        if (query.isBlank()) {
            query = "DynamicCode window.seft ctx.helperApi csmApi";
        }
        try {
            List<AiBusinessMemoryVectorService.SearchHit> hits = aiBusinessMemoryVectorService.searchWithScopes(
                appId,
                query,
                5,
                AiScopedContextIngestionService.SCOPE_CODE);
            if (hits == null || hits.isEmpty()) {
                hits = aiBusinessMemoryVectorService.search(appId, query, 5);
            }
            for (AiBusinessMemoryVectorService.SearchHit hit : hits) {
                if (hit == null) {
                    continue;
                }
                String text = !hit.content().isBlank() ? hit.content() : hit.summary();
                if (text == null || text.isBlank()) {
                    continue;
                }
                if (!text.contains("seft") && !text.contains("csmApi") && !text.contains("helperApi")
                    && !text.contains("DynamicCode") && !text.contains("function")) {
                    continue;
                }
                sb.append("RAG_CODE_PATTERN:\n").append(compactCodeDigest(text.trim())).append("\n---\n");
            }
            return trimToMax(sb.toString().trim(), sampleCodeDigestMaxChars);
        } catch (Exception ex) {
            log.debug("Learned code sample digest failed: {}", ex.getMessage());
            return trimToMax(sb.toString().trim(), sampleCodeDigestMaxChars);
        }
    }

    /** Load menu tree already saved by devs in index.menu — primary learning source per tenant. */
    private String resolveLiveAppMenuPatternDigest(String appId) {
        if (recordManager == null || appId == null || appId.isBlank()) {
            return "";
        }
        try {
            SearchFilter filter = new SearchFilter();
            filter.setField("id");
            filter.setType("eq");
            filter.setValue("menu");
            Map<String, Object> record = recordManager.find(appId, "index", filter);
            if (record == null || record.isEmpty()) {
                return "";
            }
            Object structObj = record.get("struct");
            if (structObj == null) {
                return "";
            }
            String raw = String.valueOf(structObj).trim();
            if (raw.isBlank()) {
                return "";
            }
            if (!raw.startsWith("[") && !raw.startsWith("{")) {
                try {
                    raw = recordManager.csm_decrypt(raw);
                } catch (Exception ex) {
                    log.debug("Menu struct decrypt failed appId={}: {}", appId, ex.getMessage());
                    return "";
                }
            }
            List<Map<String, Object>> roots = parseMenuRoots(raw);
            if (roots.isEmpty()) {
                return "";
            }
            indexLiveMenuLeafPatterns(appId, roots);
            if (aiScopedContextIngestionService != null) {
                try {
                    aiScopedContextIngestionService.ingestMenu(
                        appId,
                        raw,
                        AiScopedContextIngestionService.SCOPE_MENU,
                        true,
                        "greenfield-menu-learn");
                } catch (Exception ex) {
                    log.debug("Live menu Lucene ingest skipped: {}", ex.getMessage());
                }
            }
            MenuBusinessScan scan = scanMenuBusinessStructure(raw);
            StringBuilder sb = new StringBuilder();
            sb.append("LIVE_APP_MENU (index.menu — dev đã thiết kế, bám cấu trúc/field/trigger tương tự)\n");
            sb.append(buildMenuExistingSummary(scan, "")).append("\n");
            if (!scan.typeFormCounts().isEmpty()) {
                sb.append("TYPE_FORMS: ").append(formatTypeFormCounts(scan.typeFormCounts())).append("\n");
            }
            sb.append("TREE:\n");
            walkMenuDigestNodes(roots, sb, 0, 0, 45);
            return trimToMax(sb.toString().trim(), sampleMenuDigestMaxChars);
        } catch (Exception ex) {
            log.debug("Live app menu pattern digest failed appId={}: {}", appId, ex.getMessage());
            return "";
        }
    }

    private String resolveTenantRagSnippet(String appId, String message, boolean menuFlow) {
        if (aiTenantKnowledgeIngestionService != null && appId != null && !appId.isBlank()) {
            try {
                aiTenantKnowledgeIngestionService.ingestTenantKnowledge(appId);
            } catch (Exception ex) {
                log.debug("Tenant ingest before comprehend skipped: {}", ex.getMessage());
            }
        }
        if (aiBusinessMemoryVectorService == null || appId == null || appId.isBlank()) {
            return "";
        }
        try {
            int scope = menuFlow
                ? AiScopedContextIngestionService.SCOPE_MENU
                : AiScopedContextIngestionService.SCOPE_CODE;
            List<AiBusinessMemoryVectorService.SearchHit> hits =
                aiBusinessMemoryVectorService.searchWithScopes(appId, message, 3, scope);
            if (hits == null || hits.isEmpty()) {
                hits = aiBusinessMemoryVectorService.search(appId, message, 3);
            }
            StringBuilder sb = new StringBuilder();
            for (AiBusinessMemoryVectorService.SearchHit hit : hits) {
                if (hit == null) {
                    continue;
                }
                String text = !hit.content().isBlank() ? hit.content() : hit.summary();
                if (text == null || text.isBlank()) {
                    continue;
                }
                sb.append("- ").append(text.trim()).append("\n");
            }
            return trimToMax(sb.toString().trim(), tenantRagMaxChars);
        } catch (Exception ex) {
            log.debug("Tenant RAG snippet failed: {}", ex.getMessage());
            return "";
        }
    }

    /** User asked for a full ERP-style menu (đầy đủ / XNT + công nợ + báo cáo). */
    public static boolean isComprehensiveGreenfieldMenuRequest(String userMessage) {
        String msg = String.valueOf(userMessage == null ? "" : userMessage).toLowerCase(Locale.ROOT);
        if (msg.isBlank()) {
            return false;
        }
        return msg.contains("đầy đủ")
            || msg.contains("day du")
            || msg.contains("toàn bộ")
            || msg.contains("toan bo")
            || msg.contains("full menu")
            || msg.contains("complete menu")
            || (msg.contains("báo cáo") && (msg.contains("bán hàng") || msg.contains("xuất nhập") || msg.contains("công nợ")))
            || (msg.contains("xuất nhập") && msg.contains("công nợ"));
    }

    public List<String> listPlannedModuleLabels(BusinessSpec spec, String userMessage) {
        BusinessSpec enriched = enrichBusinessSpecForMenuGreenfield(spec, userMessage);
        List<String> out = new ArrayList<>();
        if (enriched.plannedStructure() != null) {
            for (Map<String, Object> row : enriched.plannedStructure()) {
                if (row == null) {
                    continue;
                }
                String module = String.valueOf(row.getOrDefault("module", "")).trim();
                if (!module.isBlank()) {
                    out.add(module);
                }
            }
        }
        if (out.isEmpty() && enriched.modules() != null) {
            out.addAll(enriched.modules().stream().filter(m -> !String.valueOf(m).isBlank()).toList());
        }
        return out.stream().distinct().limit(24).toList();
    }

    /**
     * Prose business analysis for Composer — analyze-only menu (no Lego apply plan).
     */
    public String buildAnalyzeMenuReasoningProseVi(
            BusinessSpec spec,
            ExecutionPlan plan,
            String userMessage) {
        if (spec == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("## Phân tích nghiệp vụ (menu hiện có)\n\n");
        String domain = String.valueOf(spec.domainSummary() == null ? "" : spec.domainSummary()).trim();
        if (!domain.isBlank()) {
            sb.append("**Phạm vi:** ").append(domain).append("\n\n");
        }
        String existing = String.valueOf(spec.existingBusinessSummary() == null ? "" : spec.existingBusinessSummary()).trim();
        if (!existing.isBlank()) {
            sb.append("**Hiện trạng editor:** ").append(trimToMax(existing, 900)).append("\n\n");
        }
        List<String> modules = spec.modules() == null ? List.of() : spec.modules();
        if (!modules.isEmpty()) {
            sb.append("**Module / node (**").append(modules.size()).append("**):\n");
            int idx = 1;
            for (String module : modules.stream().limit(20).toList()) {
                if (!String.valueOf(module).isBlank()) {
                    sb.append(idx++).append(". ").append(module.trim()).append("\n");
                }
            }
            sb.append("\n");
        }
        List<String> flows = spec.flows() == null ? List.of() : spec.flows();
        if (!flows.isEmpty()) {
            sb.append("**Luồng nghiệp vụ:** ").append(String.join(" → ", flows.stream().limit(6).toList())).append("\n\n");
        }
        List<String> tables = spec.tables() == null ? List.of() : spec.tables();
        if (!tables.isEmpty()) {
            sb.append("**Bảng liên quan:** ").append(String.join(", ", tables.stream().limit(10).toList())).append("\n\n");
        }
        if (plan != null && plan.steps() != null && !plan.steps().isEmpty()) {
            sb.append("**Góc nhìn phân tích (không sửa editor):**\n");
            int stepIdx = 1;
            for (ExecutionStep step : plan.steps()) {
                if (step == null) {
                    continue;
                }
                String action = String.valueOf(step.action() == null ? "" : step.action()).trim();
                String target = String.valueOf(step.target() == null ? "" : step.target()).trim();
                if (action.isBlank() && target.isBlank()) {
                    continue;
                }
                sb.append(stepIdx++).append(". ").append(action.isBlank() ? target : action);
                if (!target.isBlank() && !action.isBlank()) {
                    sb.append(" — ").append(target);
                }
                sb.append("\n");
            }
            sb.append("\n");
        }
        sb.append("*Chế độ **phân tích** — trả lời prose; **không** áp patch/menu vào CodeMirror trừ khi bạn yêu cầu sửa rõ ràng.*\n");
        return sb.toString().trim();
    }

    /**
     * Deterministic menu business analysis from editor JSON — for analyze fast path without LLM.
     */
    public String buildHeuristicMenuBusinessAnalysisProse(String menuJson, String requestText) {
        MenuBusinessScan scan = scanMenuBusinessStructure(String.valueOf(menuJson == null ? "" : menuJson));
        if (scan.totalNodes() <= 0) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("## Phân tích nghiệp vụ menu\n\n");
        sb.append("**Phạm vi:** ").append(scan.totalNodes()).append(" node menu");
        if (!scan.moduleLabels().isEmpty()) {
            sb.append(" — ").append(String.join(", ", scan.moduleLabels().stream().limit(8).toList()));
        }
        sb.append("\n\n");

        if (!scan.moduleLabels().isEmpty()) {
            sb.append("**Module / nhóm menu (**").append(scan.moduleLabels().size()).append("**):\n");
            int idx = 1;
            for (String module : scan.moduleLabels().stream().limit(24).toList()) {
                if (!String.valueOf(module).isBlank()) {
                    sb.append(idx++).append(". ").append(module.trim()).append("\n");
                }
            }
            sb.append("\n");
        }

        if (!scan.tables().isEmpty()) {
            sb.append("**Bảng dữ liệu (**").append(scan.tables().size()).append("**): ")
                .append(String.join(", ", scan.tables().stream().limit(16).toList()))
                .append("\n\n");
        }

        if (!scan.typeFormCounts().isEmpty()) {
            sb.append("**Loại form (type_form):** ");
            List<String> typeParts = new ArrayList<>();
            scan.typeFormCounts().forEach((type, count) ->
                typeParts.add("type " + type + "=" + count));
            sb.append(String.join(", ", typeParts.stream().limit(10).toList())).append("\n\n");
        }

        if (!scan.triggerSummaries().isEmpty()) {
            sb.append("**Trigger / hành vi nghiệp vụ:**\n");
            for (String trigger : scan.triggerSummaries().stream().limit(12).toList()) {
                if (!String.valueOf(trigger).isBlank()) {
                    sb.append("- ").append(trigger.trim()).append("\n");
                }
            }
            sb.append("\n");
        }

        sb.append("**Luồng nghiệp vụ (suy luận từ cấu trúc menu):**\n");
        sb.append("- Người dùng điều hướng theo cây menu → mở form/báo cáo theo `type_form` và `table_name`.\n");
        if (!scan.tables().isEmpty()) {
            sb.append("- Dữ liệu CRUD/grid gắn với bảng: ")
                .append(String.join(", ", scan.tables().stream().limit(6).toList()))
                .append(".\n");
        }
        if (!scan.triggerSummaries().isEmpty()) {
            sb.append("- Trigger điều phối mở form, query, hoặc luồng con khi chọn node.\n");
        }
        sb.append("\n");

        List<String> risks = new ArrayList<>();
        if (!scan.emptyTriggerNodeIds().isEmpty()) {
            risks.add(scan.emptyTriggerNodeIds().size() + " node thiếu trigger (id: "
                + String.join(", ", scan.emptyTriggerNodeIds().stream().limit(5).toList()) + ")");
        }
        if (!scan.nodesMissingI18n().isEmpty()) {
            risks.add(scan.nodesMissingI18n().size() + " node thiếu label_en/label_zh");
        }
        if (scan.tableColumnI18nGaps() > 0) {
            risks.add(scan.tableColumnI18nGaps() + " cột bảng thiếu i18n");
        }
        if (!risks.isEmpty()) {
            sb.append("**Góc nhìn chất lượng / rủi ro:**\n");
            for (String risk : risks) {
                sb.append("- ").append(risk).append("\n");
            }
            sb.append("\n");
        }

        String req = String.valueOf(requestText == null ? "" : requestText).trim();
        if (!req.isBlank()) {
            sb.append("**Yêu cầu người dùng:** ").append(trimToMax(req, 240)).append("\n\n");
        }
        sb.append("*Chế độ **phân tích** — chỉ mô tả nghiệp vụ; không sửa JSON menu trong editor.*\n");
        return sb.toString().trim();
    }

    /**
     * Compact deterministic menu scan for worker prompt slot (analyze menu — no full JSON in model).
     */
    public String buildMenuBusinessScanDigest(String menuJson, int maxChars) {
        MenuBusinessScan scan = scanMenuBusinessStructure(String.valueOf(menuJson == null ? "" : menuJson));
        if (scan.totalNodes() <= 0) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("nodes=").append(scan.totalNodes());
        if (!scan.moduleLabels().isEmpty()) {
            sb.append(" | modules: ").append(String.join(", ", scan.moduleLabels().stream().limit(12).toList()));
        }
        if (!scan.tables().isEmpty()) {
            sb.append(" | tables: ").append(String.join(", ", scan.tables().stream().limit(10).toList()));
        }
        if (!scan.typeFormCounts().isEmpty()) {
            sb.append(" | type_form: ");
            List<String> parts = new ArrayList<>();
            scan.typeFormCounts().forEach((k, v) -> parts.add(k + "=" + v));
            sb.append(String.join(",", parts.stream().limit(8).toList()));
        }
        if (!scan.triggerSummaries().isEmpty()) {
            sb.append(" | triggers: ").append(String.join("; ", scan.triggerSummaries().stream().limit(6).toList()));
        }
        if (!scan.emptyTriggerNodeIds().isEmpty()) {
            sb.append(" | missing_trigger: ").append(scan.emptyTriggerNodeIds().size());
        }
        if (!scan.nodesMissingI18n().isEmpty()) {
            sb.append(" | missing_i18n: ").append(scan.nodesMissingI18n().size());
        }
        return trimToMax(sb.toString().trim(), Math.max(400, maxChars));
    }

    /**
     * Prose business analysis for Composer (cloud-chat-like) — from BusinessSpec + Plan, no extra LLM.
     */
    public String buildBusinessReasoningProseVi(
            BusinessSpec spec,
            ExecutionPlan plan,
            String userMessage,
            boolean greenfieldMenu) {
        if (spec == null) {
            return "";
        }
        BusinessSpec enriched = greenfieldMenu
            ? enrichBusinessSpecForMenuGreenfield(spec, userMessage)
            : spec;
        List<String> modules = listPlannedModuleLabels(enriched, userMessage);
        StringBuilder sb = new StringBuilder();
        sb.append("## Phân tích nghiệp vụ\n\n");
        String domain = String.valueOf(enriched.domainSummary() == null ? "" : enriched.domainSummary()).trim();
        if (!domain.isBlank()) {
            sb.append("**Phạm vi:** ").append(domain).append("\n\n");
        } else if (!String.valueOf(userMessage == null ? "" : userMessage).isBlank()) {
            sb.append("**Yêu cầu:** ").append(trimToMax(userMessage, 240)).append("\n\n");
        }
        if (!modules.isEmpty()) {
            sb.append("**Module cần có trong menu (**").append(modules.size()).append("**):\n");
            int idx = 1;
            for (String module : modules) {
                sb.append(idx++).append(". ").append(module).append("\n");
            }
            sb.append("\n");
        }
        List<String> flows = enriched.flows() == null ? List.of() : enriched.flows();
        if (!flows.isEmpty()) {
            sb.append("**Luồng nghiệp vụ:** ").append(String.join(" → ", flows.stream().limit(6).toList())).append("\n\n");
        }
        List<String> assumptions = enriched.assumptions() == null ? List.of() : enriched.assumptions();
        if (!assumptions.isEmpty()) {
            sb.append("**Giả định:**\n");
            for (String item : assumptions.stream().limit(5).toList()) {
                if (!String.valueOf(item).isBlank()) {
                    sb.append("- ").append(item.trim()).append("\n");
                }
            }
            sb.append("\n");
        }
        sb.append("## Kế hoạch lắp ghép (Lego CSM)\n\n");
        if (plan != null && plan.steps() != null && !plan.steps().isEmpty()) {
            int stepIdx = 1;
            for (ExecutionStep step : plan.steps()) {
                if (step == null) {
                    continue;
                }
                String action = String.valueOf(step.action() == null ? "" : step.action()).trim();
                String target = String.valueOf(step.target() == null ? "" : step.target()).trim();
                if (action.isBlank() && target.isBlank()) {
                    continue;
                }
                sb.append(stepIdx++).append(". ");
                if (!action.isBlank()) {
                    sb.append(action);
                }
                if (!target.isBlank()) {
                    sb.append(action.isBlank() ? target : " — " + target);
                }
                sb.append("\n");
            }
        } else if (!modules.isEmpty()) {
            int stepIdx = 1;
            for (String module : modules) {
                sb.append(stepIdx++).append(". Tạo node `").append(module)
                    .append("` (type_form=1 hoặc 5, table[], trigger object)\n");
            }
        }
        if (greenfieldMenu && isComprehensiveGreenfieldMenuRequest(userMessage)) {
            sb.append("\n*Thực thi tuần tự (LangGraph): scaffold Java từng module → enrich nhãn/trigger → gate → kết quả cuối.*\n");
        }
        return sb.toString().trim();
    }

    /**
     * Pass 2 — Plan: ensure modules + planned_structure[] from USER_REQUEST when LLM omitted them.
     */
    public BusinessSpec enrichBusinessSpecForMenuGreenfield(BusinessSpec spec, String userMessage) {
        if (spec == null) {
            return BusinessSpec.empty();
        }
        List<String> modules = spec.modules() == null ? new ArrayList<>() : new ArrayList<>(spec.modules());
        if (modules.isEmpty()) {
            modules.addAll(extractModulesFromLearnedContext(userMessage, "", MenuBusinessScan.empty()));
        }
        modules = modules.stream().filter(m -> !String.valueOf(m).isBlank()).distinct().limit(12).toList();

        List<Map<String, Object>> planned = spec.plannedStructure() == null
            ? new ArrayList<>()
            : new ArrayList<>(spec.plannedStructure());
        if (planned.isEmpty() && !modules.isEmpty()) {
            for (String module : modules) {
                planned.add(buildPlannedStructureRow(module, userMessage));
            }
        }
        expandPlannedStructureFromUserWording(planned, userMessage);
        normalizePlannedStructureForGreenfield(planned, userMessage);

        return new BusinessSpec(
            spec.domainSummary(),
            spec.existingBusinessSummary(),
            modules,
            spec.tables(),
            spec.flows(),
            planned.stream().limit(20).toList(),
            spec.triggersLearnedFromSample(),
            spec.triggersFromCurrentEditor(),
            spec.codePatternsFromSample(),
            spec.codePatternsFromCurrentEditor(),
            spec.userDelta().isBlank() ? trimToMax(userMessage, 500) : spec.userDelta(),
            spec.assumptions(),
            spec.risks());
    }

    private Map<String, Object> buildPlannedStructureRow(String module, String userMessage) {
        String label = String.valueOf(module == null ? "" : module).trim();
        String lower = label.toLowerCase(Locale.ROOT);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("module", label);
        row.put("notes", "From USER_REQUEST / comprehend");
        if (lower.contains("công nợ") && lower.contains("khách")) {
            row.put("lego_piece", "grid_crud");
            row.put("type_form", 1);
            row.put("table_name_hint", "m_customer_debt");
        } else if (lower.contains("công nợ") && (lower.contains("cung") || lower.contains("nhà cung") || lower.contains("ncc"))) {
            row.put("lego_piece", "grid_crud");
            row.put("type_form", 1);
            row.put("table_name_hint", "m_supplier_debt");
        } else if (lower.contains("báo cáo") || lower.contains("bao cao") || lower.contains("report")) {
            if (isNoiseReportModuleLabel(label)) {
                row.put("lego_piece", "grid_crud");
                row.put("type_form", 1);
                row.put("table_name_hint", slugTableName(label));
            } else {
                row.put("lego_piece", "report");
                row.put("type_form", 5);
                row.put("table_name_hint", slugTableName(label).replace("m_", "rpt_"));
            }
        } else {
            row.put("lego_piece", "grid_crud");
            row.put("type_form", 1);
            row.put("table_name_hint", slugTableName(label));
        }
        return row;
    }

    private void expandPlannedStructureFromUserWording(List<Map<String, Object>> planned, String userMessage) {
        String msg = String.valueOf(userMessage == null ? "" : userMessage).toLowerCase(Locale.ROOT);
        LinkedHashSet<String> existing = new LinkedHashSet<>();
        for (Map<String, Object> row : planned) {
            existing.add(String.valueOf(row.getOrDefault("module", "")).toLowerCase(Locale.ROOT));
        }
        if (msg.contains("xuất nhập") || msg.contains("xuat nhap") || msg.contains("tồn")) {
            addPlannedIfMissing(planned, existing, "Danh mục sản phẩm", "grid_crud", 1, "m_products");
            addPlannedIfMissing(planned, existing, "Khách hàng", "grid_crud", 1, "m_customers");
            addPlannedIfMissing(planned, existing, "Nhà cung cấp", "grid_crud", 1, "m_suppliers");
            addPlannedIfMissing(planned, existing, "Phiếu bán / Xuất kho", "master_detail", 2, "m_sales_orders");
            addPlannedIfMissing(planned, existing, "Phiếu mua / Nhập kho", "master_detail", 2, "m_purchase_orders");
            addPlannedIfMissing(planned, existing, "Tồn kho", "grid_crud", 1, "m_inventory");
        }
        if (msg.contains("bán hàng") || msg.contains("ban hang")) {
            addPlannedIfMissing(planned, existing, "Phiếu bán hàng", "master_detail", 2, "m_sales_orders");
        }
        if (msg.contains("công nợ") && msg.contains("khách")) {
            addPlannedIfMissing(planned, existing, "Công nợ khách hàng", "grid_crud", 1, "m_customer_debt");
        }
        if (msg.contains("công nợ") && (msg.contains("cung cấp") || msg.contains("nhà cung"))) {
            addPlannedIfMissing(planned, existing, "Công nợ nhà cung cấp", "grid_crud", 1, "m_supplier_debt");
        }
        if (msg.contains("báo cáo") || msg.contains("bao cao")) {
            addPlannedIfMissing(planned, existing, "Báo cáo doanh thu", "report", 5, "rpt_revenue");
            addPlannedIfMissing(planned, existing, "Báo cáo tồn kho", "report", 5, "rpt_inventory");
            addPlannedIfMissing(planned, existing, "Báo cáo công nợ", "report", 5, "rpt_debt");
        }
    }

    private void addPlannedIfMissing(
            List<Map<String, Object>> planned,
            Set<String> existing,
            String module,
            String legoPiece,
            int typeForm,
            String tableHint) {
        String key = module.toLowerCase(Locale.ROOT);
        if (existing.contains(key)) {
            return;
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("module", module);
        row.put("lego_piece", legoPiece);
        row.put("type_form", typeForm);
        row.put("table_name_hint", tableHint);
        row.put("notes", "Expanded from USER_REQUEST wording");
        planned.add(row);
        existing.add(key);
    }

    /** Canonical ERP root title — avoid dumping all module names into label. */
    public static String extractGreenfieldRootTitle(String userMessage) {
        String msg = String.valueOf(userMessage == null ? "" : userMessage).toLowerCase(Locale.ROOT);
        if (msg.isBlank()) {
            return "";
        }
        if (msg.contains("xuất nhập") || msg.contains("xuat nhap") || msg.contains(" xnt")) {
            return "Quản lý bán hàng XNT";
        }
        if (msg.contains("bán hàng") || msg.contains("ban hang")) {
            return "Quản lý bán hàng";
        }
        if (msg.contains("kho") || msg.contains("tồn")) {
            return "Quản lý kho";
        }
        return "";
    }

    private static boolean isNoiseReportModuleLabel(String label) {
        String lower = String.valueOf(label == null ? "" : label).toLowerCase(Locale.ROOT);
        return lower.contains("đầy đủ") || lower.contains("day du")
            || lower.contains("theo dõi") || lower.contains("theo doi")
            || lower.length() > 36;
    }

    private void normalizePlannedStructureForGreenfield(List<Map<String, Object>> planned, String userMessage) {
        if (planned == null || planned.isEmpty()) {
            return;
        }
        for (Map<String, Object> row : planned) {
            normalizePlannedModuleRow(row);
        }
        removeNoisePlannedModules(planned);
        dedupePlannedByTableHint(planned);
        dedupePlannedByModuleAlias(planned);
        planned.sort(Comparator.comparingInt(this::plannedModuleSortKey));
    }

    private void normalizePlannedModuleRow(Map<String, Object> row) {
        if (row == null) {
            return;
        }
        String module = String.valueOf(row.getOrDefault("module", "")).trim();
        String lower = module.toLowerCase(Locale.ROOT);
        if (lower.contains("công nợ") && lower.contains("khách")) {
            row.put("module", "Công nợ khách hàng");
            row.put("type_form", 1);
            row.put("lego_piece", "grid_crud");
            row.put("table_name_hint", "m_customer_debt");
        } else if (lower.contains("công nợ") && (lower.contains("cung") || lower.contains("nhà cung") || lower.contains("ncc"))) {
            row.put("module", "Công nợ nhà cung cấp");
            row.put("type_form", 1);
            row.put("lego_piece", "grid_crud");
            row.put("table_name_hint", "m_supplier_debt");
        } else if (isNoiseReportModuleLabel(module)) {
            row.put("type_form", 1);
            row.put("lego_piece", "grid_crud");
        }
    }

    private void removeNoisePlannedModules(List<Map<String, Object>> planned) {
        boolean hasStandardReports = planned.stream().anyMatch(row -> {
            if (row == null) {
                return false;
            }
            String hint = String.valueOf(row.getOrDefault("table_name_hint", "")).trim();
            String module = String.valueOf(row.getOrDefault("module", "")).trim();
            return hint.startsWith("rpt_")
                || (toIntSafe(row.get("type_form"), 1) == 5
                    && (module.startsWith("Báo cáo doanh") || module.startsWith("Báo cáo tồn") || module.startsWith("Báo cáo công")));
        });
        if (!hasStandardReports) {
            return;
        }
        planned.removeIf(row -> row != null
            && toIntSafe(row.get("type_form"), 1) == 5
            && isNoiseReportModuleLabel(String.valueOf(row.getOrDefault("module", ""))));
    }

    private void dedupePlannedByTableHint(List<Map<String, Object>> planned) {
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        planned.removeIf(row -> {
            if (row == null) {
                return true;
            }
            String hint = String.valueOf(row.getOrDefault("table_name_hint", "")).trim();
            if (hint.isBlank()) {
                hint = slugTableName(String.valueOf(row.getOrDefault("module", "")));
            }
            return !seen.add(hint.toLowerCase(Locale.ROOT));
        });
    }

    private void dedupePlannedByModuleAlias(List<Map<String, Object>> planned) {
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        planned.removeIf(row -> {
            if (row == null) {
                return true;
            }
            String alias = moduleAliasKey(String.valueOf(row.getOrDefault("module", "")));
            return !alias.isBlank() && !seen.add(alias);
        });
    }

    private String moduleAliasKey(String module) {
        String lower = String.valueOf(module == null ? "" : module).toLowerCase(Locale.ROOT);
        if (lower.contains("phiếu bán") || lower.contains("phieu ban") || lower.contains("xuất kho")) {
            return "sales_order";
        }
        if (lower.contains("phiếu mua") || lower.contains("nhập kho")) {
            return "purchase_order";
        }
        if (lower.contains("công nợ") && lower.contains("khách")) {
            return "customer_debt";
        }
        if (lower.contains("công nợ") && (lower.contains("cung") || lower.contains("ncc"))) {
            return "supplier_debt";
        }
        return lower.trim();
    }

    private int plannedModuleSortKey(Map<String, Object> row) {
        if (row == null) {
            return 999;
        }
        int typeForm = toIntSafe(row.get("type_form"), 1);
        if (typeForm == 5) {
            return 500;
        }
        String hint = String.valueOf(row.getOrDefault("table_name_hint", "")).toLowerCase(Locale.ROOT);
        String module = String.valueOf(row.getOrDefault("module", "")).toLowerCase(Locale.ROOT);
        if (hint.contains("product") || module.contains("sản phẩm")) {
            return 10;
        }
        if (hint.contains("customer") || (module.contains("khách") && !module.contains("công nợ"))) {
            return 20;
        }
        if (hint.contains("supplier") || module.contains("nhà cung")) {
            return 30;
        }
        if (hint.contains("sales") || module.contains("bán")) {
            return 40;
        }
        if (hint.contains("purchase") || module.contains("mua")) {
            return 50;
        }
        if (hint.contains("inventory") || module.contains("tồn")) {
            return 60;
        }
        if (hint.contains("debt") || module.contains("công nợ")) {
            return 70;
        }
        return 100;
    }

    /**
     * Pass 3 — Assemble: deterministic menu skeleton from planned_structure (Java, quality-gate safe).
     * LLM worker may enrich labels later; scaffold guarantees full business coverage.
     */
    public String buildGreenfieldMenuScaffoldJson(BusinessSpec spec, String userMessage) {
        if (!menuGreenfieldScaffoldEnabled || spec == null || objectMapper == null) {
            return "";
        }
        BusinessSpec enriched = enrichBusinessSpecForMenuGreenfield(spec, userMessage);
        List<Map<String, Object>> planned = enriched.plannedStructure();
        if (planned == null || planned.isEmpty()) {
            return "";
        }

        String rootId = "biz_root";
        String rootLabel = extractGreenfieldRootTitle(userMessage);
        if (rootLabel.isBlank()) {
            rootLabel = enriched.domainSummary().isBlank()
                ? trimToMax(userMessage, 60)
                : trimToMax(enriched.domainSummary(), 60);
        }
        Map<String, Object> root = scaffoldGroupNode(rootId, "", rootLabel, "folder");

        List<Map<String, Object>> crudChildren = new ArrayList<>();
        List<Map<String, Object>> reportChildren = new ArrayList<>();
        String reportGroupId = "reports_group";

        for (Map<String, Object> row : planned) {
            if (row == null) {
                continue;
            }
            String module = String.valueOf(row.getOrDefault("module", "")).trim();
            if (module.isBlank()) {
                continue;
            }
            int typeForm = toIntSafe(row.get("type_form"), 1);
            String tableHint = String.valueOf(row.getOrDefault("table_name_hint", "")).trim();
            if (tableHint.isBlank()) {
                tableHint = slugTableName(module);
            }
            String nodeId = slugNodeId(module);
            if (typeForm == 5) {
                reportChildren.add(scaffoldReportNode(nodeId, reportGroupId, module, tableHint));
            } else if (typeForm == 2 || isMasterDetailModuleLabel(module)) {
                crudChildren.add(scaffoldMasterDetailNode(nodeId, rootId, module, tableHint));
            } else {
                crudChildren.add(scaffoldCrudNode(nodeId, rootId, module, tableHint));
            }
        }

        List<Map<String, Object>> children = new ArrayList<>(crudChildren);
        if (!reportChildren.isEmpty()) {
            Map<String, Object> reportGroup = scaffoldGroupNode(reportGroupId, rootId, "Báo cáo", "chart");
            reportGroup.put("children", reportChildren);
            children.add(reportGroup);
        }
        root.put("children", children);

        Map<String, Object> wrapped = new LinkedHashMap<>();
        wrapped.put("menu", List.of(root));
        try {
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(wrapped);
            if (menuQualityGateService != null) {
                List<Map<String, Object>> menus = parseMenuRoots(json);
                menuQualityGateService.repairMenuTreeInPlace(menus);
                applyGreenfieldCsmBusinessRulesToTree(menus);
                return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(
                    Map.of("menu", menus));
            }
            return json;
        } catch (Exception ex) {
            log.warn("buildGreenfieldMenuScaffoldJson failed: {}", ex.getMessage());
            return "";
        }
    }

    /**
     * AD-R4 — After Java scaffold: execute each leaf module sequentially (deterministic i18n + optional LLM enrich + gate).
     */
    public String enrichGreenfieldMenuByModule(
            String menuJson,
            BusinessSpec spec,
            String userMessage,
            ModuleEnrichProgress progress) {
        return enrichGreenfieldMenuByModule(menuJson, spec, userMessage, progress, null);
    }

    public String enrichGreenfieldMenuByModule(
            String menuJson,
            BusinessSpec spec,
            String userMessage,
            ModuleEnrichProgress progress,
            AgentHandoffCallback handoff) {
        return enrichGreenfieldMenuByModule(menuJson, spec, userMessage, progress, handoff, null);
    }

    /**
     * AD-R4 + AD-R3 — per-module enrich with optional Reviewer→Planner replan loop and agent handoff SSE.
     */
    public String enrichGreenfieldMenuByModule(
            String menuJson,
            BusinessSpec spec,
            String userMessage,
            ModuleEnrichProgress progress,
            AgentHandoffCallback handoff,
            String appId) {
        if (!isMenuModuleEnrichEnabled() || menuJson == null || menuJson.isBlank() || objectMapper == null) {
            return menuJson;
        }
        List<Map<String, Object>> roots = parseMenuRoots(menuJson);
        if (roots.isEmpty()) {
            return menuJson;
        }
        List<Map<String, Object>> leaves = collectEnrichableMenuLeaves(roots);
        if (leaves.isEmpty()) {
            return menuJson;
        }
        int total = Math.min(leaves.size(), Math.max(1, menuModuleEnrichMaxModules));
        int llmCalls = 0;
        int replanCount = 0;
        long started = System.currentTimeMillis();
        emitAgentHandoff(handoff, "Supervisor", "Executor", "module_enrich_start",
            "AD-R4 enrich " + total + " leaf modules");
        for (int i = 0; i < total; i++) {
            Map<String, Object> node = leaves.get(i);
            if (node == null) {
                continue;
            }
            int index = i + 1;
            String nodeId = String.valueOf(node.getOrDefault("id", "")).trim();
            String moduleLabel = String.valueOf(node.getOrDefault("label", "")).trim();
            emitModuleProgress(progress, index, total, moduleLabel, nodeId, "running",
                "Đang enrich module (Java + LLM nếu có)", false);
            applyDeterministicModuleI18n(node);
            applyGreenfieldCsmBusinessRules(node);
            if (appId != null && !appId.isBlank()) {
                applyLiveMenuPatternHints(node, appId, moduleLabel, userMessage);
            }
            boolean usedLlm = false;
            if (llamaCppNativeService != null && llamaCppNativeService.isAvailable()) {
                try {
                    String patchRaw = llamaCppNativeService.generateContentFast(
                        buildModuleEnrichPrompt(node, userMessage, spec),
                        Math.max(128, menuModuleEnrichMaxTokens));
                    if (applyModuleEnrichPatch(node, patchRaw)) {
                        usedLlm = true;
                        llmCalls++;
                    }
                } catch (Exception ex) {
                    log.debug("Module LLM enrich failed id={}: {}", nodeId, ex.getMessage());
                }
            }
            if (menuQualityGateService != null) {
                menuQualityGateService.repairMenuTreeInPlace(roots);
            }
            String gateDetail = validateModuleNodeSoft(roots, nodeId);
            int replanAttempt = 0;
            while (menuModuleReplanEnabled
                    && !gateDetail.isBlank()
                    && replanAttempt < Math.max(0, menuModuleReplanMaxAttempts)) {
                replanAttempt++;
                replanCount++;
                emitAgentHandoff(handoff, "Reviewer", "Planner", "replan_module",
                    "AD-R3 module=" + moduleLabel + " issue=" + trimToMax(gateDetail, 120));
                emitModuleProgress(progress, index, total, moduleLabel, nodeId, "replanning",
                    "Reviewer → Planner: " + gateDetail, usedLlm);
                replanGreenfieldModuleNode(node, userMessage);
                if (menuQualityGateService != null) {
                    menuQualityGateService.repairMenuTreeInPlace(roots);
                }
                gateDetail = validateModuleNodeSoft(roots, nodeId);
            }
            emitAgentHandoff(handoff, "Executor", "Reviewer", "module_gate",
                gateDetail.isBlank() ? "pass " + moduleLabel : "warn " + trimToMax(gateDetail, 80));
            emitModuleProgress(progress, index, total, moduleLabel, nodeId,
                gateDetail.isBlank() ? "completed" : "completed_with_warnings",
                gateDetail.isBlank()
                    ? (usedLlm ? "LLM + gate OK" : "Java enrich + gate OK")
                    : gateDetail,
                usedLlm);
        }
        if (menuQualityGateService != null) {
            menuQualityGateService.repairMenuTreeInPlace(roots);
        }
        applyGreenfieldCsmBusinessRulesToTree(roots);
        try {
            String out = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("menu", roots));
            log.info(
                "MENU_GREENFIELD module-enrich modules={} llmCalls={} replans={} elapsedMs={}",
                total,
                llmCalls,
                replanCount,
                System.currentTimeMillis() - started);
            return out;
        } catch (Exception ex) {
            log.warn("enrichGreenfieldMenuByModule serialize failed: {}", ex.getMessage());
            return menuJson;
        }
    }

    /**
     * AD-R2 — Trusted Knowledge: validate + repair menu before CodeMirror apply (hard gate).
     */
    public GreenfieldApplyGateResult gateGreenfieldMenuForApply(String menuJson, String userMessage) {
        if (menuJson == null || menuJson.isBlank() || objectMapper == null) {
            return new GreenfieldApplyGateResult(false, 0, "", "empty_menu_json");
        }
        List<Map<String, Object>> roots = parseMenuRoots(menuJson);
        if (roots.isEmpty()) {
            return new GreenfieldApplyGateResult(false, 0, "", "no_menu_nodes");
        }
        applyGreenfieldCsmBusinessRulesToTree(roots);
        if (menuQualityGateService != null) {
            menuQualityGateService.repairMenuTreeInPlace(roots);
        }
        if (menuQualityGateService == null) {
            try {
                String out = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("menu", roots));
                return new GreenfieldApplyGateResult(true, 100, out, "");
            } catch (Exception ex) {
                return new GreenfieldApplyGateResult(false, 0, menuJson, ex.getMessage());
            }
        }
        MenuQualityGateService.QualityReport report =
            menuQualityGateService.validateMenuJson(roots, String.valueOf(userMessage == null ? "" : userMessage));
        String issueSummary = report.passesHardGate
            ? ""
            : report.getErrors().stream()
                .limit(3)
                .map(e -> String.valueOf(e == null ? "" : e.message).trim())
                .filter(s -> !s.isBlank())
                .reduce((a, b) -> a + "; " + b)
                .orElse("menu quality hard gate failed");
        try {
            String out = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("menu", roots));
            return new GreenfieldApplyGateResult(report.passesHardGate, report.qualityScore, out, issueSummary);
        } catch (Exception ex) {
            return new GreenfieldApplyGateResult(false, report.qualityScore, menuJson, ex.getMessage());
        }
    }

    private void replanGreenfieldModuleNode(Map<String, Object> node, String userMessage) {
        if (node == null) {
            return;
        }
        int typeForm = toIntSafe(node.get("type_form"), 1);
        String label = String.valueOf(node.getOrDefault("label", "")).trim();
        node.remove("trigger");
        upgradeMinimalTriggers(node, typeForm, label);
        applyGreenfieldCsmBusinessRules(node);
        applyDeterministicModuleI18n(node);
        Object children = node.get("children");
        if (children instanceof List<?> childList) {
            for (Object childObj : childList) {
                if (childObj instanceof Map<?, ?> childMap) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> child = (Map<String, Object>) childMap;
                    replanGreenfieldModuleNode(child, userMessage);
                }
            }
        }
    }

    private void emitAgentHandoff(
            AgentHandoffCallback handoff,
            String fromAgent,
            String toAgent,
            String action,
            String detail) {
        if (handoff == null) {
            return;
        }
        handoff.onHandoff(fromAgent, toAgent, action, detail);
    }

    private void emitModuleProgress(
            ModuleEnrichProgress progress,
            int index,
            int total,
            String label,
            String nodeId,
            String status,
            String detail,
            boolean usedLlm) {
        if (progress == null) {
            return;
        }
        progress.onProgress(new ModuleEnrichEvent(index, total, label, nodeId, status, detail, usedLlm));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> collectEnrichableMenuLeaves(List<Map<String, Object>> roots) {
        List<Map<String, Object>> leaves = new ArrayList<>();
        Deque<Map<String, Object>> stack = new ArrayDeque<>();
        for (int i = roots.size() - 1; i >= 0; i--) {
            if (roots.get(i) != null) {
                stack.push(roots.get(i));
            }
        }
        while (!stack.isEmpty()) {
            Map<String, Object> node = stack.pop();
            int typeForm = toIntSafe(node.get("type_form"), -1);
            Object children = node.get("children");
            if (children instanceof List<?> childList && !childList.isEmpty()) {
                for (int i = childList.size() - 1; i >= 0; i--) {
                    Object child = childList.get(i);
                    if (child instanceof Map<?, ?> childMap) {
                        stack.push((Map<String, Object>) childMap);
                    }
                }
                continue;
            }
            if (typeForm == 1 || typeForm == 2 || typeForm == 5) {
                leaves.add(node);
            }
        }
        return leaves;
    }

    private void applyDeterministicModuleI18n(Map<String, Object> node) {
        if (node == null) {
            return;
        }
        String label = String.valueOf(node.getOrDefault("label", "")).trim();
        if (!label.isBlank()) {
            node.put("label_en", resolveLabelEn(label));
            node.put("label_zh", resolveLabelZh(label));
        }
        Object tableObj = node.get("table");
        if (tableObj instanceof List<?> fields) {
            for (Object fieldObj : fields) {
                if (!(fieldObj instanceof Map<?, ?> fieldRaw)) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> field = (Map<String, Object>) fieldRaw;
                String header = String.valueOf(field.getOrDefault("f_header", "")).trim();
                if (header.isBlank()) {
                    continue;
                }
                field.put("f_header_en", resolveFieldHeaderEn(header));
                field.put("f_header_zh", resolveFieldHeaderZh(header));
            }
        }
    }

    private String buildModuleEnrichPrompt(Map<String, Object> node, String userMessage, BusinessSpec spec) {
        String label = String.valueOf(node.getOrDefault("label", "")).trim();
        int typeForm = toIntSafe(node.get("type_form"), 1);
        String tableName = String.valueOf(node.getOrDefault("table_name", node.getOrDefault("report_name", ""))).trim();
        String nodeSnippet = trimToMax(String.valueOf(node), 900);
        String domain = spec == null ? "" : trimToMax(spec.domainSummary(), 200);
        return """
            [MODULE_ENRICH_ONE_SHOT]
            Enrich ONE CSM menu node. Return ONLY valid JSON object (no markdown):
            {"label_en":"...","label_zh":"...","table":[{"f_name":"existing","f_header_en":"...","f_header_zh":"..."}]}
            Rules: keep f_name unchanged; label_en/label_zh professional ERP terms; table[] only patch headers.
            type_form=%d table/report=%s module=%s
            domain=%s
            USER_REQUEST=%s
            NODE=%s
            [/MODULE_ENRICH_ONE_SHOT]
            """.formatted(
            typeForm,
            tableName,
            label,
            domain,
            trimToMax(userMessage, 280),
            nodeSnippet);
    }

    @SuppressWarnings("unchecked")
    private boolean applyModuleEnrichPatch(Map<String, Object> node, String raw) {
        if (node == null || raw == null || raw.isBlank() || objectMapper == null) {
            return false;
        }
        try {
            String json = extractJsonObject(raw);
            if (json.isBlank()) {
                return false;
            }
            JsonNode root = objectMapper.readTree(json);
            boolean touched = false;
            String labelEn = root.path("label_en").asText("").trim();
            String labelZh = root.path("label_zh").asText("").trim();
            if (!labelEn.isBlank()) {
                node.put("label_en", labelEn);
                touched = true;
            }
            if (!labelZh.isBlank()) {
                node.put("label_zh", labelZh);
                touched = true;
            }
            JsonNode tablePatches = root.get("table");
            if (tablePatches != null && tablePatches.isArray()) {
                Object tableObj = node.get("table");
                if (tableObj instanceof List<?> fields) {
                    for (JsonNode patch : tablePatches) {
                        String fName = patch.path("f_name").asText("").trim();
                        if (fName.isBlank()) {
                            continue;
                        }
                        for (Object fieldObj : fields) {
                            if (!(fieldObj instanceof Map<?, ?> fieldRaw)) {
                                continue;
                            }
                            Map<String, Object> field = (Map<String, Object>) fieldRaw;
                            if (!fName.equals(String.valueOf(field.get("f_name")).trim())) {
                                continue;
                            }
                            String hen = patch.path("f_header_en").asText("").trim();
                            String hzh = patch.path("f_header_zh").asText("").trim();
                            if (!hen.isBlank()) {
                                field.put("f_header_en", hen);
                                touched = true;
                            }
                            if (!hzh.isBlank()) {
                                field.put("f_header_zh", hzh);
                                touched = true;
                            }
                            break;
                        }
                    }
                }
            }
            return touched;
        } catch (Exception ex) {
            log.debug("applyModuleEnrichPatch failed: {}", ex.getMessage());
            return false;
        }
    }

    private String validateModuleNodeSoft(List<Map<String, Object>> roots, String nodeId) {
        if (menuQualityGateService == null || nodeId.isBlank()) {
            return "";
        }
        MenuQualityGateService.QualityReport report =
            menuQualityGateService.validateMenuJson(roots, "module_enrich");
        if (report.passesHardGate) {
            return "";
        }
        return report.getErrors().stream()
            .filter(e -> e != null && String.valueOf(e.path).contains(nodeId))
            .map(e -> String.valueOf(e.message))
            .limit(2)
            .reduce((a, b) -> a + "; " + b)
            .orElse("");
    }

    private String resolveLabelEn(String labelVi) {
        String lower = labelVi.toLowerCase(Locale.ROOT);
        if (lower.contains("danh mục") && lower.contains("sản phẩm")) {
            return "Product catalog";
        }
        if (lower.equals("khách hàng") || lower.contains("khách hàng")) {
            return lower.contains("công nợ") ? "Customer receivables" : "Customers";
        }
        if (lower.contains("nhà cung cấp") || lower.contains("ncc")) {
            return lower.contains("công nợ") ? "Supplier payables" : "Suppliers";
        }
        if (lower.contains("phiếu bán") || lower.contains("xuất kho")) {
            return "Sales / outbound slip";
        }
        if (lower.contains("phiếu mua") || lower.contains("nhập kho")) {
            return "Purchase / inbound slip";
        }
        if (lower.contains("tồn kho")) {
            return "Inventory";
        }
        if (lower.contains("báo cáo doanh thu")) {
            return "Revenue report";
        }
        if (lower.contains("báo cáo tồn")) {
            return "Inventory report";
        }
        if (lower.contains("báo cáo công nợ")) {
            return "Receivables report";
        }
        if (lower.contains("báo cáo")) {
            return "Report: " + trimToMax(labelVi, 40);
        }
        if (lower.contains("công nợ") && lower.contains("khách")) {
            return "Customer receivables";
        }
        if (lower.contains("công nợ")) {
            return "Supplier payables";
        }
        return trimToMax(labelVi, 64);
    }

    private String resolveLabelZh(String labelVi) {
        String lower = labelVi.toLowerCase(Locale.ROOT);
        if (lower.contains("danh mục") && lower.contains("sản phẩm")) {
            return "产品目录";
        }
        if (lower.contains("khách hàng")) {
            return lower.contains("công nợ") ? "客户应收" : "客户";
        }
        if (lower.contains("nhà cung cấp") || lower.contains("ncc")) {
            return lower.contains("công nợ") ? "供应商应付" : "供应商";
        }
        if (lower.contains("phiếu bán") || lower.contains("xuất kho")) {
            return "销售/出库单";
        }
        if (lower.contains("phiếu mua") || lower.contains("nhập kho")) {
            return "采购/入库单";
        }
        if (lower.contains("tồn kho")) {
            return "库存";
        }
        if (lower.contains("báo cáo doanh thu")) {
            return "营收报表";
        }
        if (lower.contains("báo cáo tồn")) {
            return "库存报表";
        }
        if (lower.contains("báo cáo công nợ")) {
            return "应收应付报表";
        }
        if (lower.contains("báo cáo")) {
            return "报表";
        }
        if (lower.contains("công nợ") && lower.contains("khách")) {
            return "客户应收";
        }
        if (lower.contains("công nợ")) {
            return "供应商应付";
        }
        return trimToMax(labelVi, 32);
    }

    private String resolveFieldHeaderEn(String headerVi) {
        return switch (headerVi.toLowerCase(Locale.ROOT)) {
            case "mã sp", "mã sản phẩm" -> "Product code";
            case "tên sản phẩm", "tên sp" -> "Product name";
            case "mã kh", "mã k/h" -> "Customer code";
            case "tên khách hàng" -> "Customer name";
            case "mã ncc" -> "Supplier code";
            case "tên ncc" -> "Supplier name";
            case "số phiếu" -> "Document no.";
            case "ngày" -> "Date";
            case "tổng tiền" -> "Total amount";
            case "tồn" -> "Qty on hand";
            case "kho" -> "Warehouse";
            case "đvt" -> "Unit";
            case "giá bán" -> "Sale price";
            case "điện thoại" -> "Phone";
            case "địa chỉ" -> "Address";
            case "đối tượng" -> "Partner";
            case "số tiền" -> "Amount";
            case "hạn thanh toán" -> "Due date";
            case "trạng thái" -> "Status";
            case "từ ngày" -> "From date";
            case "đến ngày" -> "To date";
            default -> headerVi;
        };
    }

    private String resolveFieldHeaderZh(String headerVi) {
        return switch (headerVi.toLowerCase(Locale.ROOT)) {
            case "mã sp", "mã sản phẩm" -> "产品编码";
            case "tên sản phẩm", "tên sp" -> "产品名称";
            case "mã kh" -> "客户编码";
            case "tên khách hàng" -> "客户名称";
            case "mã ncc" -> "供应商编码";
            case "tên ncc" -> "供应商名称";
            case "số phiếu" -> "单号";
            case "ngày" -> "日期";
            case "tổng tiền" -> "总金额";
            case "tồn" -> "库存量";
            case "kho" -> "仓库";
            case "đvt" -> "单位";
            case "giá bán" -> "售价";
            case "điện thoại" -> "电话";
            case "địa chỉ" -> "地址";
            case "đối tượng" -> "对象";
            case "số tiền" -> "金额";
            case "hạn thanh toán" -> "到期日";
            case "trạng thái" -> "状态";
            case "từ ngày" -> "起始日期";
            case "đến ngày" -> "截止日期";
            default -> headerVi;
        };
    }

    private Map<String, Object> scaffoldGroupNode(String id, String parentId, String label, String icon) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", id);
        node.put("parentId", parentId);
        node.put("label", label);
        node.put("label_en", label);
        node.put("label_zh", label);
        node.put("icon", icon);
        node.put("type_form", 0);
        return node;
    }

    @SuppressWarnings("unchecked")
    private void applyGreenfieldCsmBusinessRulesToTree(List<Map<String, Object>> roots) {
        if (roots == null || roots.isEmpty()) {
            return;
        }
        Deque<Map<String, Object>> stack = new ArrayDeque<>();
        for (int i = roots.size() - 1; i >= 0; i--) {
            if (roots.get(i) != null) {
                stack.push(roots.get(i));
            }
        }
        while (!stack.isEmpty()) {
            Map<String, Object> node = stack.pop();
            applyGreenfieldCsmBusinessRules(node);
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                for (int i = childList.size() - 1; i >= 0; i--) {
                    Object child = childList.get(i);
                    if (child instanceof Map<?, ?> childMap) {
                        stack.push((Map<String, Object>) childMap);
                    }
                }
            }
        }
    }

    private static final String TRIGGER_LOAD_DB = "(seft, db) => { return null; }";

    private static final String TRIGGER_GRID_BEFORE_SAVE =
        "(seft, data, bang) => {\n"
            + "  if (!data) return false;\n"
            + "  return data;\n"
            + "}";

    private static final String TRIGGER_GRID_UPDATE =
        "(seft, data, bang) => {\n"
            + "  if (!data) return data;\n"
            + "  return data;\n"
            + "}";

    private static final String TRIGGER_MD_BEFORE_SAVE =
        "(seft, data, bang) => {\n"
            + "  if (!data) return false;\n"
            + "  const lines = Array.isArray(data.chi_tiet) ? data.chi_tiet : [];\n"
            + "  let total = 0;\n"
            + "  for (const row of lines) {\n"
            + "    const qty = Number(row.so_luong) || 0;\n"
            + "    const price = Number(row.don_gia) || 0;\n"
            + "    row.thanh_tien = qty * price;\n"
            + "    total += row.thanh_tien;\n"
            + "  }\n"
            + "  data.tong_tien = total;\n"
            + "  data.total_amount = total;\n"
            + "  return data;\n"
            + "}";

    private static final String TRIGGER_MD_LINE_UPDATE =
        "(seft, data, bang) => {\n"
            + "  if (!data) return data;\n"
            + "  const qty = Number(data.so_luong) || 0;\n"
            + "  const price = Number(data.don_gia) || 0;\n"
            + "  data.thanh_tien = qty * price;\n"
            + "  return data;\n"
            + "}";

    private static final String TRIGGER_REPORT_DB =
        "(seft, db) => {\n"
            + "  return [];\n"
            + "}";

    private static final String TRIGGER_REPORT_FILTER =
        "(seft, db) => {\n"
            + "  return null;\n"
            + "}";

    private Map<String, Object> scaffoldCrudNode(String id, String parentId, String label, String tableName) {
        Map<String, Object> node = scaffoldGroupNode(id, parentId, label, "MenuOutlined");
        node.put("type_form", 1);
        node.put("table_name", tableName);
        node.put("row_type_edit", 0);
        node.put("table", defaultTableFieldsForModule(label, tableName));
        node.put("trigger", buildGridCrudTriggers(label));
        applyGreenfieldCsmBusinessRules(node);
        return node;
    }

    private Map<String, Object> scaffoldMasterDetailNode(String id, String parentId, String label, String tableName) {
        Map<String, Object> node = scaffoldGroupNode(id, parentId, label, "FileTextOutlined");
        node.put("type_form", 2);
        node.put("table_name", tableName);
        node.put("row_type_edit", 0);

        List<Map<String, Object>> masterFields = new ArrayList<>();
        masterFields.add(pkField("id"));
        masterFields.add(field("order_no", "Số phiếu", "ed"));
        masterFields.add(dateField("order_date", "Ngày"));
        if (isSalesModuleLabel(label)) {
            masterFields.add(comboField("customer_id", "Khách hàng", "m_customers", "id", "customer_name"));
        } else if (isPurchaseModuleLabel(label)) {
            masterFields.add(comboField("supplier_id", "Nhà cung cấp", "m_suppliers", "id", "supplier_name"));
        }
        masterFields.add(numberField("total_amount", "Tổng tiền", 2));
        masterFields.add(statusField("status", "Trạng thái", List.of(
            Map.of("value", "draft", "label", "Nháp"),
            Map.of("value", "posted", "label", "Đã ghi sổ"))));
        masterFields.add(field("note", "Ghi chú", "ed"));
        node.put("table", masterFields);
        node.put("trigger", buildMasterDetailTriggers());

        String detailTabId = id + "_chi_tiet";
        Map<String, Object> detailTab = scaffoldGroupNode(detailTabId, id, "Chi tiết", "TableOutlined");
        detailTab.put("type_form", 1);
        detailTab.put("table_name", "chi_tiet");
        detailTab.put("m_show", false);
        detailTab.put("field_root", "order_id");
        detailTab.put("table", buildOrderDetailLineFields());
        detailTab.put("trigger", Map.of("update", TRIGGER_MD_LINE_UPDATE));
        applyGreenfieldCsmBusinessRules(detailTab);
        node.put("children", List.of(detailTab));
        applyGreenfieldCsmBusinessRules(node);
        return node;
    }

    private Map<String, Object> scaffoldReportNode(String id, String parentId, String label, String reportName) {
        Map<String, Object> node = scaffoldGroupNode(id, parentId, label, "BarChartOutlined");
        node.put("type_form", 5);
        node.put("report_name", reportName);
        node.put("table", List.of(
            dateField("from_date", "Từ ngày"),
            dateField("to_date", "Đến ngày")));
        node.put("trigger", buildReportTriggers());
        applyGreenfieldCsmBusinessRules(node);
        return node;
    }

    /** Deterministic CSM field types, combo queries, and trigger templates (1.5B-safe). */
    @SuppressWarnings("unchecked")
    private void applyGreenfieldCsmBusinessRules(Map<String, Object> node) {
        if (node == null) {
            return;
        }
        int typeForm = toIntSafe(node.get("type_form"), -1);
        if (typeForm != 1 && typeForm != 2 && typeForm != 5) {
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                for (Object childObj : childList) {
                    if (childObj instanceof Map<?, ?> childMap) {
                        applyGreenfieldCsmBusinessRules((Map<String, Object>) childMap);
                    }
                }
            }
            return;
        }
        String label = String.valueOf(node.getOrDefault("label", "")).trim();
        String tableName = String.valueOf(node.getOrDefault("table_name", node.getOrDefault("report_name", ""))).trim();
        enrichTableFieldSemantics(node.get("table"), label, tableName);
        upgradeMinimalTriggers(node, typeForm, label);
        Object children = node.get("children");
        if (children instanceof List<?> childList) {
            for (Object childObj : childList) {
                if (childObj instanceof Map<?, ?> childMap) {
                    applyGreenfieldCsmBusinessRules((Map<String, Object>) childMap);
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void enrichTableFieldSemantics(Object tableObj, String moduleLabel, String tableName) {
        if (!(tableObj instanceof List<?> fields)) {
            return;
        }
        String lowerLabel = moduleLabel.toLowerCase(Locale.ROOT);
        for (Object fieldObj : fields) {
            if (!(fieldObj instanceof Map<?, ?> fieldRaw)) {
                continue;
            }
            Map<String, Object> field = (Map<String, Object>) fieldRaw;
            String fName = String.valueOf(field.getOrDefault("f_name", "")).trim().toLowerCase(Locale.ROOT);
            if (fName.isBlank() || toIntSafe(field.get("f_pkid"), 0) == 1) {
                continue;
            }
            if (isDateFieldName(fName)) {
                field.put("f_types", "dt");
            } else if (isNumberFieldName(fName)) {
                field.put("f_types", "nb");
                if (!field.containsKey("f_dec")) {
                    field.put("f_dec", fName.contains("qty") || fName.contains("so_luong") ? 0 : 2);
                }
            } else if (isStatusFieldName(fName) && !hasComboSource(field)) {
                field.put("f_types", "co");
                field.put("f_cbo_query", staticOptionsQuery(List.of(
                    Map.of("value", "active", "label", "Đang hoạt động"),
                    Map.of("value", "inactive", "label", "Ngưng"))));
            } else if (isCustomerLinkField(fName) && !hasComboSource(field)) {
                field.put("f_types", "co");
                field.put("f_cbo_query", tableComboQuery("m_customers", "id", "customer_name"));
            } else if (isSupplierLinkField(fName) && !hasComboSource(field)) {
                field.put("f_types", "co");
                field.put("f_cbo_query", tableComboQuery("m_suppliers", "id", "supplier_name"));
            } else if (isProductLinkField(fName) && !hasComboSource(field)) {
                field.put("f_types", "co");
                field.put("f_cbo_query", tableComboQuery("m_products", "id", "product_name"));
            } else if (isWarehouseLinkField(fName) && !hasComboSource(field)) {
                field.put("f_types", "co");
                field.put("f_cbo_query", tableComboQuery("m_warehouses", "id", "warehouse_name"));
            } else if ("ed".equals(String.valueOf(field.get("f_types")).trim())
                && (lowerLabel.contains("công nợ") || tableName.contains("debt"))
                && (fName.contains("partner") || fName.contains("doi_tuong"))) {
                if (lowerLabel.contains("khách")) {
                    field.put("f_types", "co");
                    field.put("f_cbo_query", tableComboQuery("m_customers", "id", "customer_name"));
                } else if (lowerLabel.contains("cung") || lowerLabel.contains("ncc") || lowerLabel.contains("nhà cung")) {
                    field.put("f_types", "co");
                    field.put("f_cbo_query", tableComboQuery("m_suppliers", "id", "supplier_name"));
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void upgradeMinimalTriggers(Map<String, Object> node, int typeForm, String label) {
        Object triggerObj = node.get("trigger");
        if (!(triggerObj instanceof Map<?, ?> triggerRaw)) {
            node.put("trigger", typeForm == 5
                ? buildReportTriggers()
                : (typeForm == 2 ? buildMasterDetailTriggers() : buildGridCrudTriggers(label)));
            return;
        }
        Map<String, Object> trigger = (Map<String, Object>) triggerRaw;
        if (!isMinimalPlaceholderTrigger(trigger)) {
            return;
        }
        if (typeForm == 5) {
            node.put("trigger", buildReportTriggers());
        } else if (typeForm == 2) {
            node.put("trigger", buildMasterDetailTriggers());
        } else {
            node.put("trigger", buildGridCrudTriggers(label));
        }
    }

    private boolean isMinimalPlaceholderTrigger(Map<String, Object> trigger) {
        if (trigger == null || trigger.isEmpty()) {
            return true;
        }
        if (trigger.size() != 1) {
            return false;
        }
        Object value = trigger.values().iterator().next();
        String body = String.valueOf(value == null ? "" : value).trim();
        return "(self, data, bang)".equals(body)
            || "(seft, data, bang)".equals(body)
            || "(seft, db)".equals(body)
            || body.isBlank();
    }

    private Map<String, Object> buildGridCrudTriggers(String moduleLabel) {
        Map<String, Object> trigger = new LinkedHashMap<>();
        trigger.put("load_db", TRIGGER_LOAD_DB);
        trigger.put("beforeSave", TRIGGER_GRID_BEFORE_SAVE);
        trigger.put("update", TRIGGER_GRID_UPDATE);
        if (isInventoryModuleLabel(moduleLabel)) {
            trigger.put("afterEdit", TRIGGER_GRID_UPDATE);
        }
        return trigger;
    }

    private Map<String, Object> buildMasterDetailTriggers() {
        Map<String, Object> trigger = new LinkedHashMap<>();
        trigger.put("load_db", TRIGGER_LOAD_DB);
        trigger.put("beforeSave", TRIGGER_MD_BEFORE_SAVE);
        trigger.put("update", TRIGGER_MD_LINE_UPDATE);
        return trigger;
    }

    private Map<String, Object> buildReportTriggers() {
        Map<String, Object> trigger = new LinkedHashMap<>();
        trigger.put("filter", TRIGGER_REPORT_FILTER);
        trigger.put("report_db", TRIGGER_REPORT_DB);
        return trigger;
    }

    private List<Map<String, Object>> buildOrderDetailLineFields() {
        List<Map<String, Object>> fields = new ArrayList<>();
        fields.add(pkField("id"));
        fields.add(comboField("product_id", "Sản phẩm", "m_products", "id", "product_name"));
        fields.add(numberField("so_luong", "Số lượng", 0));
        fields.add(numberField("don_gia", "Đơn giá", 2));
        Map<String, Object> lineTotal = numberField("thanh_tien", "Thành tiền", 2);
        lineTotal.put("f_show", 1);
        fields.add(lineTotal);
        return fields;
    }

    private boolean isMasterDetailModuleLabel(String label) {
        String lower = String.valueOf(label == null ? "" : label).toLowerCase(Locale.ROOT);
        return (lower.contains("phiếu") || lower.contains("phieu"))
            && (lower.contains("bán") || lower.contains("ban")
            || lower.contains("mua")
            || lower.contains("xuất") || lower.contains("xuat")
            || lower.contains("nhập") || lower.contains("nhap"));
    }

    private boolean isSalesModuleLabel(String label) {
        String lower = String.valueOf(label == null ? "" : label).toLowerCase(Locale.ROOT);
        return lower.contains("bán") || lower.contains("ban") || lower.contains("xuất") || lower.contains("xuat");
    }

    private boolean isPurchaseModuleLabel(String label) {
        String lower = String.valueOf(label == null ? "" : label).toLowerCase(Locale.ROOT);
        return lower.contains("mua") || lower.contains("nhập") || lower.contains("nhap");
    }

    private boolean isInventoryModuleLabel(String label) {
        String lower = String.valueOf(label == null ? "" : label).toLowerCase(Locale.ROOT);
        return lower.contains("tồn") || lower.contains("ton") || lower.contains("kho");
    }

    private boolean isDateFieldName(String fName) {
        return fName.contains("date") || fName.contains("ngay") || fName.endsWith("_at");
    }

    private boolean isNumberFieldName(String fName) {
        return fName.contains("amount") || fName.contains("tien") || fName.contains("price")
            || fName.contains("gia") || fName.contains("qty") || fName.contains("so_luong")
            || fName.contains("don_gia") || fName.contains("thanh_tien") || fName.equals("tong_tien");
    }

    private boolean isStatusFieldName(String fName) {
        return fName.contains("status") || fName.contains("trang_thai");
    }

    private boolean isCustomerLinkField(String fName) {
        return fName.contains("customer") || fName.contains("khach");
    }

    private boolean isSupplierLinkField(String fName) {
        return fName.contains("supplier") || fName.equals("ncc") || fName.contains("nha_cung");
    }

    private boolean isProductLinkField(String fName) {
        return fName.contains("product") || fName.contains("ma_sp") || fName.equals("product_code");
    }

    private boolean isWarehouseLinkField(String fName) {
        return fName.contains("warehouse") || fName.equals("kho");
    }

    private boolean hasComboSource(Map<String, Object> field) {
        String cbo = String.valueOf(field.getOrDefault("f_cbo_query", "")).trim();
        if (!cbo.isBlank()) {
            return true;
        }
        Object opts = field.get("f_options");
        return opts instanceof List<?> list && !list.isEmpty();
    }

    private String tableComboQuery(String tableName, String valueField, String labelField) {
        return "{\"query\":[{\"obj_name\":\""
            + tableName
            + "\",\"fields\":[\""
            + valueField
            + "\",\""
            + labelField
            + "\"]}],\"options\":[]}";
    }

    private String staticOptionsQuery(List<Map<String, String>> options) {
        StringBuilder sb = new StringBuilder("{\"query\":[],\"options\":[");
        for (int i = 0; i < options.size(); i++) {
            Map<String, String> opt = options.get(i);
            if (i > 0) {
                sb.append(',');
            }
            sb.append("{\"value\":\"")
                .append(opt.getOrDefault("value", ""))
                .append("\",\"label\":\"")
                .append(opt.getOrDefault("label", ""))
                .append("\"}");
        }
        sb.append("]}");
        return sb.toString();
    }

    private Map<String, Object> dateField(String name, String header) {
        return field(name, header, "dt");
    }

    private Map<String, Object> numberField(String name, String header, int decimals) {
        Map<String, Object> f = field(name, header, "nb");
        f.put("f_dec", decimals);
        return f;
    }

    private Map<String, Object> comboField(
            String name, String header, String refTable, String valueField, String labelField) {
        Map<String, Object> f = field(name, header, "co");
        f.put("f_cbo_query", tableComboQuery(refTable, valueField, labelField));
        return f;
    }

    private Map<String, Object> statusField(String name, String header, List<Map<String, String>> options) {
        Map<String, Object> f = field(name, header, "co");
        f.put("f_cbo_query", staticOptionsQuery(options));
        return f;
    }

    private List<Map<String, Object>> defaultTableFieldsForModule(String label, String tableName) {
        List<Map<String, Object>> fields = new ArrayList<>();
        fields.add(pkField("id"));
        String lower = label.toLowerCase(Locale.ROOT);
        if (lower.contains("sản phẩm") || tableName.contains("product")) {
            fields.add(field("product_code", "Mã SP", "ed"));
            fields.add(field("product_name", "Tên sản phẩm", "ed"));
            fields.add(field("unit", "ĐVT", "ed"));
            fields.add(field("price", "Giá bán", "ed"));
        } else if (lower.contains("khách") && !lower.contains("công nợ")) {
            fields.add(field("customer_code", "Mã KH", "ed"));
            fields.add(field("customer_name", "Tên khách hàng", "ed"));
            fields.add(field("phone", "Điện thoại", "ed"));
            fields.add(field("address", "Địa chỉ", "ed"));
        } else if (lower.contains("nhà cung") || lower.contains("cung cấp")) {
            fields.add(field("supplier_code", "Mã NCC", "ed"));
            fields.add(field("supplier_name", "Tên NCC", "ed"));
            fields.add(field("phone", "Điện thoại", "ed"));
        } else if (lower.contains("bán") || lower.contains("xuất")) {
            fields.add(field("order_no", "Số phiếu", "ed"));
            fields.add(dateField("order_date", "Ngày"));
            fields.add(comboField("customer_id", "Khách hàng", "m_customers", "id", "customer_name"));
            fields.add(numberField("total_amount", "Tổng tiền", 2));
        } else if (lower.contains("mua") || lower.contains("nhập")) {
            fields.add(field("order_no", "Số phiếu", "ed"));
            fields.add(dateField("order_date", "Ngày"));
            fields.add(comboField("supplier_id", "NCC", "m_suppliers", "id", "supplier_name"));
            fields.add(numberField("total_amount", "Tổng tiền", 2));
        } else if (lower.contains("tồn") || lower.contains("kho")) {
            fields.add(comboField("product_id", "Mã SP", "m_products", "id", "product_code"));
            fields.add(field("product_name", "Tên SP", "ed"));
            fields.add(numberField("qty_on_hand", "Tồn", 0));
            fields.add(comboField("warehouse_id", "Kho", "m_warehouses", "id", "warehouse_name"));
        } else if (lower.contains("công nợ")) {
            fields.add(field("partner_name", "Đối tượng", "ed"));
            fields.add(numberField("amount", "Số tiền", 2));
            fields.add(dateField("due_date", "Hạn thanh toán"));
            fields.add(statusField("status", "Trạng thái", List.of(
                Map.of("value", "open", "label", "Còn nợ"),
                Map.of("value", "paid", "label", "Đã thanh toán"))));
        } else {
            fields.add(field("code", "Mã", "ed"));
            fields.add(field("name", "Tên", "ed"));
            fields.add(field("note", "Ghi chú", "ed"));
        }
        return fields;
    }

    private Map<String, Object> pkField(String name) {
        Map<String, Object> f = field(name, "ID", "ed");
        f.put("f_pkid", 1);
        return f;
    }

    private Map<String, Object> field(String name, String header, String types) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("f_name", name);
        f.put("f_header", header);
        f.put("f_types", types);
        f.put("f_header_en", header);
        f.put("f_header_zh", header);
        return f;
    }

    private String slugNodeId(String label) {
        String slug = slugTableName(label);
        return slug.startsWith("m_") ? slug.substring(2) : slug;
    }

    private String slugTableName(String label) {
        String raw = String.valueOf(label == null ? "" : label)
            .toLowerCase(Locale.ROOT)
            .replace('đ', 'd')
            .replaceAll("[^a-z0-9\\s]", " ")
            .trim()
            .replaceAll("\\s+", "_");
        if (raw.isBlank()) {
            return "m_module";
        }
        if (!raw.startsWith("m_") && !raw.startsWith("rpt_")) {
            raw = "m_" + raw;
        }
        return raw.length() > 48 ? raw.substring(0, 48) : raw;
    }

    private int toIntSafe(Object raw, int fallback) {
        if (raw instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(raw).trim());
        } catch (Exception ignored) {
            return fallback;
        }
    }

    /** AD-R6 — search Lucene and build citation rows for SSE / Composer. */
    public List<Map<String, Object>> searchRagCitations(
            String appId,
            String query,
            boolean menuFlow,
            int maxHits) {
        if (aiBusinessMemoryVectorService == null || appId == null || appId.isBlank()) {
            return List.of();
        }
        String safeQuery = String.valueOf(query == null ? "" : query).trim();
        if (safeQuery.isBlank()) {
            safeQuery = menuFlow ? "menu type_form trigger f_cbo_query CSM" : "CSM dynamic code trigger";
        }
        int limit = maxHits > 0 ? maxHits : Math.max(1, ragCitationsMaxHits);
        try {
            int scope = menuFlow
                ? AiScopedContextIngestionService.SCOPE_MENU
                : AiScopedContextIngestionService.SCOPE_CODE;
            List<AiBusinessMemoryVectorService.SearchHit> hits =
                aiBusinessMemoryVectorService.searchWithScopes(appId, safeQuery, limit, scope);
            if (hits == null || hits.isEmpty()) {
                hits = aiBusinessMemoryVectorService.search(appId, safeQuery, limit);
            }
            return buildRagCitationRows(hits, safeQuery);
        } catch (Exception ex) {
            log.debug("searchRagCitations failed appId={}: {}", appId, ex.getMessage());
            return List.of();
        }
    }

    private List<Map<String, Object>> buildRagCitationRows(
            List<AiBusinessMemoryVectorService.SearchHit> hits,
            String queryText) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (hits == null || hits.isEmpty()) {
            return out;
        }
        List<String> queryTokens = tokenizeForCitationMatch(queryText);
        for (AiBusinessMemoryVectorService.SearchHit hit : hits) {
            if (hit == null) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            String sourceCategory = classifyCitationSourceCategory(hit);
            row.put("source", buildCitationSourceLabel(hit, sourceCategory));
            row.put("chunkId", trimToMax(str(hit.chunkId()), 48));
            row.put("summary", trimToMax(str(hit.summary()), 140));
            row.put("score", Math.round(hit.score() * 1000.0f) / 1000.0f);
            row.put("sourceCategory", sourceCategory);
            row.put("matchedTokens", collectCitationMatchedTokens(hit, queryTokens, 4));
            row.put("recent", isRecentCitationHit(hit));
            row.put("freshnessScore",
                Math.round(AiBusinessMemoryVectorService.computeFreshnessScore(hit.createdAtMs()) * 1000.0) / 1000.0);
            String excerptSource = !hit.content().isBlank() ? hit.content() : hit.summary();
            row.put("contentExcerpt", trimToMax(str(excerptSource), 240));
            out.add(row);
            if (out.size() >= Math.max(1, ragCitationsMaxHits)) {
                break;
            }
        }
        return out;
    }

    /** AD-R6 — index trigger/combo samples from live tenant menu leaves into Lucene. */
    @SuppressWarnings("unchecked")
    private void indexLiveMenuLeafPatterns(String appId, List<Map<String, Object>> roots) {
        if (!liveMenuPatternIndexEnabled
                || aiBusinessMemoryVectorService == null
                || !aiBusinessMemoryVectorService.isEnabled()
                || objectMapper == null
                || roots == null
                || roots.isEmpty()) {
            return;
        }
        int indexed = 0;
        int maxLeaves = Math.max(8, liveMenuPatternIndexMaxLeaves);
        Deque<Map<String, Object>> stack = new ArrayDeque<>();
        for (int i = roots.size() - 1; i >= 0; i--) {
            stack.push(roots.get(i));
        }
        while (!stack.isEmpty() && indexed < maxLeaves) {
            Map<String, Object> node = stack.pop();
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                for (int i = childList.size() - 1; i >= 0; i--) {
                    Object childObj = childList.get(i);
                    if (childObj instanceof Map<?, ?> childMap) {
                        stack.push((Map<String, Object>) childMap);
                    }
                }
            }
            int typeForm = toIntSafe(node.get("type_form"), -1);
            if (typeForm != 1 && typeForm != 2 && typeForm != 5) {
                continue;
            }
            Object trigger = node.get("trigger");
            String triggerText = trigger == null ? "" : String.valueOf(trigger).trim();
            if (triggerText.isBlank() || "{}".equals(triggerText)) {
                continue;
            }
            String nodeId = str(node.get("id"));
            if (nodeId.isBlank()) {
                nodeId = "node_" + indexed;
            }
            String label = str(node.get("label"));
            Map<String, Object> pattern = new LinkedHashMap<>();
            pattern.put("kind", "LIVE_MENU_PATTERN");
            pattern.put("nodeId", nodeId);
            pattern.put("label", label);
            pattern.put("type_form", typeForm);
            pattern.put("table_name", str(node.get("table_name")));
            if (trigger instanceof Map<?, ?> triggerMap) {
                pattern.put("trigger", triggerMap);
            }
            List<Map<String, Object>> comboFields = extractComboFieldPatterns(node.get("table"));
            if (!comboFields.isEmpty()) {
                pattern.put("comboFields", comboFields);
            }
            try {
                String json = objectMapper.writeValueAsString(pattern);
                String suffix = "live_pat_" + slugNodeId(label.isBlank() ? nodeId : label);
                List<String> tags = List.of(
                    "live_menu_pattern",
                    "type_form_" + typeForm,
                    label.isBlank() ? "menu_leaf" : label);
                aiBusinessMemoryVectorService.indexDynamicContext(
                    appId,
                    suffix,
                    json,
                    tags,
                    AiScopedContextIngestionService.SCOPE_MENU);
                indexed++;
            } catch (Exception ex) {
                log.debug("Live menu pattern index skip id={}: {}", nodeId, ex.getMessage());
            }
        }
        if (indexed > 0) {
            log.info("LIVE_MENU_PATTERN indexed {} leaf patterns appId={}", indexed, appId);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractComboFieldPatterns(Object tableObj) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(tableObj instanceof List<?> fields)) {
            return out;
        }
        for (Object fieldObj : fields) {
            if (!(fieldObj instanceof Map<?, ?> fieldRaw)) {
                continue;
            }
            Map<String, Object> field = (Map<String, Object>) fieldRaw;
            String fTypes = str(field.get("f_types")).trim();
            if (!"co".equalsIgnoreCase(fTypes) && !hasComboSource(field)) {
                continue;
            }
            String fName = str(field.get("f_name")).trim();
            if (fName.isBlank()) {
                continue;
            }
            Map<String, Object> combo = new LinkedHashMap<>();
            combo.put("f_name", fName);
            combo.put("f_types", "co");
            combo.put("f_header", str(field.get("f_header")));
            if (!str(field.get("f_cbo_query")).isBlank()) {
                combo.put("f_cbo_query", str(field.get("f_cbo_query")));
            }
            out.add(combo);
            if (out.size() >= 12) {
                break;
            }
        }
        return out;
    }

    /** AD-R6 — merge live-menu trigger/combo hints when Java defaults are still minimal. */
    @SuppressWarnings("unchecked")
    private boolean applyLiveMenuPatternHints(
            Map<String, Object> node,
            String appId,
            String moduleLabel,
            String userMessage) {
        if (!liveMenuPatternIndexEnabled
                || aiBusinessMemoryVectorService == null
                || objectMapper == null
                || node == null
                || appId == null
                || appId.isBlank()) {
            return false;
        }
        String query = (moduleLabel == null ? "" : moduleLabel).trim()
            + " LIVE_MENU_PATTERN trigger f_cbo_query type_form "
            + trimToMax(String.valueOf(userMessage == null ? "" : userMessage), 96);
        try {
            List<AiBusinessMemoryVectorService.SearchHit> hits = aiBusinessMemoryVectorService.searchWithScopes(
                appId,
                query.trim(),
                3,
                AiScopedContextIngestionService.SCOPE_MENU);
            if (hits == null || hits.isEmpty()) {
                return false;
            }
            for (AiBusinessMemoryVectorService.SearchHit hit : hits) {
                if (hit == null || !hit.content().contains("LIVE_MENU_PATTERN")) {
                    continue;
                }
                JsonNode root = objectMapper.readTree(hit.content());
                if (!"LIVE_MENU_PATTERN".equals(root.path("kind").asText())) {
                    continue;
                }
                int hintTypeForm = root.path("type_form").asInt(-1);
                int nodeTypeForm = toIntSafe(node.get("type_form"), -1);
                if (hintTypeForm > 0 && nodeTypeForm > 0 && hintTypeForm != nodeTypeForm) {
                    continue;
                }
                Object triggerObj = node.get("trigger");
                if (triggerObj instanceof Map<?, ?> triggerMap
                        && isMinimalPlaceholderTrigger((Map<String, Object>) triggerMap)) {
                    JsonNode triggerNode = root.get("trigger");
                    if (triggerNode != null && triggerNode.isObject()) {
                        node.put("trigger", objectMapper.convertValue(triggerNode, Map.class));
                    }
                }
                mergeComboFieldsFromPattern(node.get("table"), root.get("comboFields"));
                Object children = node.get("children");
                if (children instanceof List<?> childList) {
                    for (Object childObj : childList) {
                        if (childObj instanceof Map<?, ?> childMap) {
                            Map<String, Object> child = (Map<String, Object>) childMap;
                            mergeComboFieldsFromPattern(child.get("table"), root.get("comboFields"));
                        }
                    }
                }
                return true;
            }
        } catch (Exception ex) {
            log.debug("applyLiveMenuPatternHints failed module={}: {}", moduleLabel, ex.getMessage());
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private void mergeComboFieldsFromPattern(Object tableObj, JsonNode comboFieldsNode) {
        if (!(tableObj instanceof List<?> fields) || comboFieldsNode == null || !comboFieldsNode.isArray()) {
            return;
        }
        for (Object fieldObj : fields) {
            if (!(fieldObj instanceof Map<?, ?> fieldRaw)) {
                continue;
            }
            Map<String, Object> field = (Map<String, Object>) fieldRaw;
            if (hasComboSource(field)) {
                continue;
            }
            String fName = str(field.get("f_name")).trim().toLowerCase(Locale.ROOT);
            if (fName.isBlank()) {
                continue;
            }
            for (JsonNode comboNode : comboFieldsNode) {
                String hintName = comboNode.path("f_name").asText("").trim().toLowerCase(Locale.ROOT);
                if (hintName.isBlank() || !hintName.equals(fName)) {
                    continue;
                }
                String cbo = comboNode.path("f_cbo_query").asText("").trim();
                if (!cbo.isBlank()) {
                    field.put("f_types", "co");
                    field.put("f_cbo_query", cbo);
                }
                break;
            }
        }
    }

    private List<String> tokenizeForCitationMatch(String queryText) {
        LinkedHashSet<String> tokens = new LinkedHashSet<>();
        String safe = String.valueOf(queryText == null ? "" : queryText).toLowerCase(Locale.ROOT);
        Matcher matcher = Pattern.compile("[a-z0-9_\\u00c0-\\u1ef9]{2,}").matcher(safe);
        while (matcher.find() && tokens.size() < 16) {
            tokens.add(matcher.group());
        }
        return List.copyOf(tokens);
    }

    private List<String> collectCitationMatchedTokens(
            AiBusinessMemoryVectorService.SearchHit hit,
            List<String> queryTokens,
            int limit) {
        if (hit == null || queryTokens == null || queryTokens.isEmpty()) {
            return List.of();
        }
        String haystack = (str(hit.content()) + " " + str(hit.summary()) + " " + str(hit.sourceName()))
            .toLowerCase(Locale.ROOT);
        List<String> matched = new ArrayList<>();
        for (String token : queryTokens) {
            if (token != null && !token.isBlank() && haystack.contains(token.toLowerCase(Locale.ROOT))) {
                matched.add(token);
                if (matched.size() >= Math.max(1, limit)) {
                    break;
                }
            }
        }
        return matched;
    }

    private String classifyCitationSourceCategory(AiBusinessMemoryVectorService.SearchHit hit) {
        String source = str(hit.sourceName()).toLowerCase(Locale.ROOT);
        if (source.contains("live_pat_") || source.contains("live_menu_pattern")) {
            return "live_menu_pattern";
        }
        if (source.contains("menu") || source.contains("index.menu")) {
            return "current_menu";
        }
        if (source.contains("dyn_ctx") || source.contains("attachment")) {
            return "attachment_context";
        }
        if (source.contains("code") || source.contains("dynamic")) {
            return "current_code";
        }
        if (source.contains("tenant") || source.contains("business")) {
            return "reference_docs";
        }
        return "general";
    }

    private String buildCitationSourceLabel(
            AiBusinessMemoryVectorService.SearchHit hit,
            String sourceCategory) {
        String raw = trimToMax(str(hit.sourceName()), 96);
        if ("live_menu_pattern".equals(sourceCategory)) {
            return "live_menu_pattern:" + raw;
        }
        return raw.isBlank() ? sourceCategory : raw;
    }

    private boolean isRecentCitationHit(AiBusinessMemoryVectorService.SearchHit hit) {
        if (hit == null || hit.createdAtMs() <= 0L) {
            return false;
        }
        long ageMs = Math.max(0L, System.currentTimeMillis() - hit.createdAtMs());
        return ageMs <= 60 * 60_000L;
    }
}
