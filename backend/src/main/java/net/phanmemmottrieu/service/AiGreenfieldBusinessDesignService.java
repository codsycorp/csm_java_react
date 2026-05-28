package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    public record BusinessSpec(
        String domainSummary,
        String existingBusinessSummary,
        List<String> modules,
        List<String> tables,
        List<String> flows,
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
            return new BusinessSpec("", "", List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), "", List.of(), List.of());
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
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeCode = String.valueOf(currentCode == null ? "" : currentCode);
        String safeMode = String.valueOf(responseMode == null ? "edit" : responseMode).trim().toLowerCase(Locale.ROOT);
        String safeContext = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase(Locale.ROOT);
        List<Map<String, Object>> safeAttachments = attachments == null ? List.of() : attachments;

        boolean hasEditor = !safeCode.isBlank();
        boolean hasSamples = hasSampleSignals(safeAttachments, safeMessage, editorMetadata);
        boolean greenfield = !hasEditor;
        boolean menuFlow = "menu_json".equals(safeContext);

        if ("analyze".equals(safeMode) && hasEditor && !hasSamples) {
            return ComprehensionResult.skipped();
        }
        if (!shouldActivate(greenfield, hasSamples, hasEditor, safeMode)) {
            return ComprehensionResult.skipped();
        }

        InputScenario scenario = detectScenario(greenfield, hasSamples, hasEditor);
        String operationScenario = extractOperationScenario(safeMessage, greenfield, menuFlow);
        String sampleMenuDigest = extractSampleMenuDigest(safeAttachments, safeMessage, editorMetadata);
        String sampleCodeDigest = extractSampleCodeDigest(safeAttachments, safeMessage, menuFlow);
        String activeEditorDigest = extractActiveEditorDigest(safeCode, menuFlow);
        String systemMasterDigest = resolveSystemMasterDigest(appId, menuFlow);
        String tenantRag = resolveTenantRagSnippet(appId, safeMessage, menuFlow);
        String userRequest = trimToMax(safeMessage, userRequestMaxChars);

        BusinessSpec spec = buildBusinessSpec(
            appId,
            userRequest,
            sampleMenuDigest,
            sampleCodeDigest,
            activeEditorDigest,
            systemMasterDigest,
            tenantRag,
            menuFlow,
            scenario);
        ExecutionPlan plan = buildExecutionPlan(
            spec,
            operationScenario,
            menuFlow,
            greenfield,
            editTaskPlan,
            safeMessage);
        String block = buildWorkerPromptBlock(spec, plan, workerPromptBlockMaxChars);

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
        if (!comprehension.greenfield()) {
            return providerText;
        }
        boolean menuFlow = "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType));
        String seed = menuFlow
            ? buildDeterministicMenuSeed(comprehension.businessSpec())
            : buildDeterministicCodeSeed(comprehension.businessSpec());
        log.info("BusinessComprehension deterministic seed fallback menuFlow={} chars={}", menuFlow, seed.length());
        return seed;
    }

    private boolean shouldActivate(boolean greenfield, boolean hasSamples, boolean hasEditor, String responseMode) {
        if (!"edit".equalsIgnoreCase(String.valueOf(responseMode == null ? "" : responseMode))) {
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
        InputScenario scenario
    ) {
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
                    return parsed;
                }
            } catch (Exception ex) {
                log.warn("BusinessSpec LLM comprehend failed, using heuristic: {}", ex.getMessage());
            }
        }
        return buildHeuristicBusinessSpec(
            userRequest,
            sampleMenuDigest,
            sampleCodeDigest,
            activeEditorDigest,
            menuFlow,
            scenario);
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

    private BusinessSpec buildHeuristicBusinessSpec(
        String userRequest,
        String sampleMenuDigest,
        String sampleCodeDigest,
        String activeEditorDigest,
        boolean menuFlow,
        InputScenario scenario
    ) {
        List<String> modules = extractModulesFromText(activeEditorDigest);
        if (modules.isEmpty()) {
            modules = extractModulesFromText(userRequest);
        }
        if (modules.isEmpty() && !sampleMenuDigest.isBlank()) {
            modules = extractModulesFromText(sampleMenuDigest);
        }
        List<String> tables = extractTablesFromText(
            userRequest + " " + sampleMenuDigest + " " + activeEditorDigest);
        List<String> triggersSample = extractTriggerHints(sampleMenuDigest);
        List<String> triggersCurrent = extractTriggerHints(activeEditorDigest);
        List<String> triggers = mergeStringLists(triggersCurrent, triggersSample);
        List<String> codePatternsSample = extractCodePatterns(sampleCodeDigest);
        List<String> codePatternsCurrent = extractCodePatterns(activeEditorDigest);
        List<String> codePatterns = mergeStringLists(codePatternsCurrent, codePatternsSample);
        List<String> flows = new ArrayList<>();
        if (menuFlow) {
            flows.add("list → form → save → trigger/filter");
        } else {
            flows.add("init → load data → bind events → save");
        }
        List<String> assumptions = new ArrayList<>();
        List<String> risks = new ArrayList<>();
        if (scenario == InputScenario.A_GREENFIELD) {
            assumptions.add("Greenfield — dùng scaffold CSM chuẩn + master prompt khi model yếu");
            risks.add("Thiếu mẫu/editor — cần xác nhận module/bảng nếu output không đủ");
        } else if (scenario == InputScenario.C_EDIT_EXISTING) {
            assumptions.add("Giữ cấu trúc nghiệp vụ hiện có — chỉ sửa theo user_delta");
            risks.add("Menu/code lớn — worker chỉ nhận digest + plan slices");
        }
        if (modules.isEmpty()) {
            modules = List.of(menuFlow ? "Module hiện tại" : "DynamicCode module");
        }
        String existingSummary = trimToMax(
            activeEditorDigest.isBlank()
                ? "Chưa có editor — chỉ dựa yêu cầu + hệ thống"
                : activeEditorDigest,
            600);
        String summary = menuFlow
            ? "Menu CSM: " + String.join(", ", modules.stream().limit(4).toList())
            : "DynamicCode CSM: " + String.join(", ", modules.stream().limit(4).toList());
        if (!existingSummary.isBlank() && scenario == InputScenario.C_EDIT_EXISTING) {
            summary = summary + " | Hiện trạng: " + trimToMax(existingSummary, 200);
        }
        return new BusinessSpec(
            summary,
            existingSummary,
            modules,
            tables,
            flows,
            triggersSample,
            triggersCurrent,
            codePatternsSample,
            codePatternsCurrent,
            trimToMax(userRequest, 500),
            assumptions,
            risks);
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
        String userMessage
    ) {
        List<ExecutionStep> steps = new ArrayList<>();
        int idx = 1;
        String msgLower = String.valueOf(userMessage == null ? "" : userMessage).toLowerCase(Locale.ROOT);

        if (!greenfield && menuFlow) {
            if (msgLower.contains("trigger") || msgLower.contains("nghiệp vụ") || msgLower.contains("nghiep vu")) {
                steps.add(new ExecutionStep(
                    "s" + idx++,
                    "audit_and_patch_triggers",
                    "all_menu_nodes",
                    List.of("trigger.filter", "trigger.load_db", "trigger.update")));
            }
            if (msgLower.contains("ngôn ngữ") || msgLower.contains("ngon ngu") || msgLower.contains("label")
                    || msgLower.contains("i18n") || msgLower.contains("en") || msgLower.contains("zh")) {
                steps.add(new ExecutionStep(
                    "s" + idx++,
                    "enrich_i18n_labels",
                    "menu_nodes_and_table_columns",
                    List.of("label", "label_en", "label_zh", "f_label", "f_label_en", "f_label_zh")));
            }
            if (msgLower.contains("cột") || msgLower.contains("cot") || msgLower.contains("bảng") || msgLower.contains("table")) {
                steps.add(new ExecutionStep(
                    "s" + idx++,
                    "patch_table_columns",
                    "table[]",
                    List.of("f_types", "f_header", "f_cbo_query", "f_show")));
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

    public String buildWorkerPromptBlock(BusinessSpec spec, ExecutionPlan plan, int maxChars) {
        if (spec == null || plan == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("## BUSINESS_COMPREHENSION (internal — follow strictly)\n");
        sb.append("Domain: ").append(spec.domainSummary()).append("\n");
        if (spec.existingBusinessSummary() != null && !spec.existingBusinessSummary().isBlank()) {
            sb.append("Existing business (editor): ").append(trimToMax(spec.existingBusinessSummary(), 500)).append("\n");
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
        sb.append("[/BUSINESS_COMPREHENSION]\n");
        return trimToMax(sb.toString(), Math.max(800, maxChars));
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

    private String buildDeterministicMenuSeed(BusinessSpec spec) {
        int modules = Math.max(1, menuSeedModuleCount);
        List<Map<String, Object>> menu = new ArrayList<>();
        List<String> moduleNames = spec.modules() == null || spec.modules().isEmpty()
            ? List.of("Module chính")
            : spec.modules();
        for (int i = 0; i < modules && i < moduleNames.size(); i++) {
            String name = moduleNames.get(i);
            Map<String, Object> group = new LinkedHashMap<>();
            group.put("id", "grp_" + (i + 1));
            group.put("menu_id", "grp_" + (i + 1));
            group.put("label", name);
            group.put("label_en", name);
            group.put("label_zh", name);
            group.put("type_form", 0);
            group.put("parentId", null);
            group.put("children", List.of(buildSeedFormNode(name, i + 1)));
            menu.add(group);
        }
        if (menu.isEmpty()) {
            menu.add(buildSeedFormNode("Module chính", 1));
        }
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("menu", menu);
        envelope.put("notes", List.of("Deterministic greenfield seed (PHẦN AC fallback)"));
        envelope.put("warnings", spec.risks() == null ? List.of() : spec.risks());
        envelope.put("coverage_modules", moduleNames.stream().limit(modules).toList());
        try {
            return objectMapper.writeValueAsString(envelope);
        } catch (Exception ex) {
            return "{\"menu\":[],\"warnings\":[\"seed serialization failed\"]}";
        }
    }

    private Map<String, Object> buildSeedFormNode(String moduleName, int index) {
        String table = specTableName(moduleName, index);
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", "node_" + index);
        node.put("menu_id", "node_" + index);
        node.put("label", moduleName);
        node.put("label_en", moduleName);
        node.put("label_zh", moduleName);
        node.put("type_form", 1);
        node.put("table_name", table);
        node.put("trigger", Map.of("filter", "status=1"));
        return node;
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
            window.seft = window.seft || {};
            var ctx = window.seft;
            ctx.helperApi = ctx.helperApi || {};

            function init_%s() {
              // TODO: bind grid/form per BusinessSpec
            }

            function load_%s() {
              return ctx.helperApi.post({ action: 'list', table: '%s' });
            }

            init_%s();
            """.formatted(
            sanitizeSymbol(module),
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

    private List<String> extractModulesFromText(String text) {
        List<String> out = new ArrayList<>();
        String safe = String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT);
        for (String token : List.of("module", "menu", "quản lý", "quan ly", "đơn hàng", "don hang", "khách hàng", "khach hang")) {
            if (safe.contains(token) && !out.contains(token)) {
                out.add(token);
            }
        }
        return out;
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

    private List<String> extractCodePatterns(String sampleCodeDigest) {
        List<String> patterns = List.of(
            "ctx.helperApi", "timerRegistry", "fnResetIP", "closeAllTabs", "webview", "window.seft");
        List<String> out = new ArrayList<>();
        String text = String.valueOf(sampleCodeDigest == null ? "" : sampleCodeDigest);
        for (String p : patterns) {
            if (text.contains(p)) {
                out.add(p);
            }
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
        List<Map<String, Object>> roots = parseMenuRoots(raw);
        if (roots.isEmpty()) {
            return compactMenuDigest(raw);
        }
        StringBuilder sb = new StringBuilder();
        sb.append("CURRENT_MENU_BUSINESS_DIGEST\n");
        walkMenuDigestNodes(roots, sb, 0, 0);
        return trimToMax(sb.toString().trim(), activeEditorDigestMaxChars);
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
        if (nodes == null || count >= 80) {
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
                count = walkMenuDigestNodes(childList, sb, depth + 1, count);
            }
            if (count >= 80) {
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
}
