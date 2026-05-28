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
            codeScan);
        ExecutionPlan plan = buildExecutionPlan(
            spec,
            operationScenario,
            menuFlow,
            greenfield,
            editTaskPlan,
            safeMessage,
            menuScan);
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
        InputScenario scenario,
        MenuBusinessScan menuScan,
        CodeBusinessScan codeScan
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
            scenario,
            menuScan,
            codeScan);
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
            modules = codeScan.symbols().stream().limit(8).toList();
            tables = new ArrayList<>(codeScan.tables());
            triggersCurrent = List.of();
            codePatternsCurrent = mergeStringLists(codeScan.lifecyclePatterns(), codeScan.apiPatterns());
            flows.add("init → load data → bind events → save");
            if (!codeScan.lifecyclePatterns().isEmpty()) {
                flows.add("lifecycle: " + String.join(", ", codeScan.lifecyclePatterns().stream().limit(4).toList()));
            }
            existingSummary = buildCodeExistingSummary(codeScan, activeEditorDigest);
        } else {
            modules = extractModulesFromText(activeEditorDigest);
            if (modules.isEmpty()) {
                modules = extractModulesFromText(userRequest);
            }
            if (modules.isEmpty() && !sampleMenuDigest.isBlank()) {
                modules = extractModulesFromText(sampleMenuDigest);
            }
            tables = extractTablesFromText(
                userRequest + " " + sampleMenuDigest + " " + activeEditorDigest);
            triggersCurrent = extractTriggerHints(activeEditorDigest);
            codePatternsCurrent = extractCodePatterns(activeEditorDigest);
            if (menuFlow) {
                flows.add("list → form → save → trigger/filter");
            } else {
                flows.add("init → load data → bind events → save");
            }
            existingSummary = trimToMax(
                activeEditorDigest.isBlank()
                    ? "Chưa có editor — chỉ dựa yêu cầu + hệ thống"
                    : activeEditorDigest,
                1200);
        }

        List<String> triggersSample = extractTriggerHints(sampleMenuDigest);
        List<String> codePatternsSample = extractCodePatterns(sampleCodeDigest);
        List<String> assumptions = new ArrayList<>();
        List<String> risks = new ArrayList<>();
        if (scenario == InputScenario.A_GREENFIELD) {
            assumptions.add("Greenfield — dùng scaffold CSM chuẩn + master prompt khi model yếu");
            risks.add("Thiếu mẫu/editor — cần xác nhận module/bảng nếu output không đủ");
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
            modules = List.of(menuFlow ? "Module hiện tại" : "DynamicCode module");
        }
        String summary = menuFlow
            ? "Menu CSM: " + String.join(", ", modules.stream().limit(6).toList())
            : "DynamicCode CSM: " + String.join(", ", modules.stream().limit(6).toList());
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
            sb.append("Symbols: ").append(String.join(", ", scan.symbols().stream().limit(12).toList()));
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
        MenuBusinessScan menuScan
    ) {
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
        for (String anchor : List.of("fnResetIP", "closeAllTabs", "timerRegistry", "window.seft", "webview")) {
            if (text.contains(anchor)) {
                lifecycle.add(anchor);
            }
        }
        List<String> apiPatterns = new ArrayList<>();
        for (String anchor : List.of("ctx.helperApi", "ctx.api", "helperApi.", "loadCombo", "saveData")) {
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
