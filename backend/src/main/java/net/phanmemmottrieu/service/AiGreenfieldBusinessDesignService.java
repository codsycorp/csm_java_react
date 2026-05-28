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

        if ("analyze".equals(safeMode) && hasEditor && !hasSamples && !isAnalyzeBusinessQuestion(safeMessage)) {
            return ComprehensionResult.skipped();
        }
        if (!shouldActivate(greenfield, hasSamples, hasEditor, safeMode, safeMessage)) {
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
            menuScan,
            safeMode,
            codeScan);
        String block = "analyze".equals(safeMode)
            ? buildAnalyzeBusinessPromptBlock(spec, plan, codeScan, menuFlow, workerPromptBlockMaxChars)
            : buildWorkerPromptBlock(spec, plan, workerPromptBlockMaxChars);

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
        boolean emptyMenu = menuFlow && isEffectivelyEmptyMenu(currentMenuCode);
        if (!comprehension.greenfield() && !emptyMenu) {
            return providerText;
        }
        String seed = menuFlow
            ? buildDeterministicMenuSeed(comprehension.businessSpec())
            : buildDeterministicCodeSeed(comprehension.businessSpec());
        log.info("BusinessComprehension deterministic seed fallback menuFlow={} emptyMenu={} chars={}",
            menuFlow, emptyMenu, seed.length());
        return seed;
    }

    private boolean isEffectivelyEmptyMenu(String menuJson) {
        if (String.valueOf(menuJson == null ? "" : menuJson).trim().isBlank()) {
            return true;
        }
        return parseMenuRoots(menuJson).isEmpty();
    }

    /** Analyze requests asking what the code does business-wise (not narrow symbol debug). */
    public static boolean isAnalyzeBusinessQuestion(String message) {
        String text = String.valueOf(message == null ? "" : message).trim().toLowerCase(Locale.ROOT);
        if (text.isBlank()) {
            return false;
        }
        String normalized = text
            .replace('đ', 'd').replace('Đ', 'd')
            .replaceAll("[^a-z0-9\\s]", " ")
            .replaceAll("\\s+", " ")
            .trim();
        int businessHits = 0;
        for (String token : List.of(
                "nghiep vu", "business logic", "business", "chuc nang", "lam gi", "lam nghiep vu",
                "phan tich", "phân tích", "logic", "luong xu ly", "luong nghiep", "toan bo",
                "tong the", "end to end", "module", "kien truc", "dong du lieu")) {
            if (normalized.contains(token) || text.contains(token)) {
                businessHits++;
            }
        }
        int narrowHits = 0;
        for (String token : List.of("ham ", "function ", "method ", "dong ", "line ", "bug", "fix", "sua loi")) {
            if (normalized.contains(token.trim()) || text.contains(token)) {
                narrowHits++;
            }
        }
        if (businessHits >= 1 && narrowHits <= 1) {
            return true;
        }
        return businessHits >= 2;
    }

    private boolean shouldActivate(boolean greenfield, boolean hasSamples, boolean hasEditor, String responseMode, String message) {
        if ("analyze".equalsIgnoreCase(String.valueOf(responseMode == null ? "" : responseMode))) {
            if (hasEditor && isAnalyzeBusinessQuestion(message)) {
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
        CodeBusinessScan codeScan
    ) {
        if (isAnalyzeBusinessQuestion(userRequest)) {
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
        if (menuFlow && scenario == InputScenario.A_GREENFIELD
                && (menuScan == null || menuScan.totalNodes() <= 0)) {
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
        boolean kqxs = scan.lifecyclePatterns() != null && scan.lifecyclePatterns().stream()
            .anyMatch(p -> p != null && p.toLowerCase(Locale.ROOT).contains("kqxs"));
        if (kqxs) {
            sb.append("Module KQXS/broadcast xổ số (React UI động, view-only/proxy config, theme, nhập số/lịch sử)");
        }
        if (!scan.symbols().isEmpty()) {
            if (sb.length() > 0) {
                sb.append("; ");
            }
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
        if (scan == null) {
            return modules;
        }
        String joined = String.join(" ",
            scan.lifecyclePatterns() == null ? "" : String.join(" ", scan.lifecyclePatterns()));
        if (joined.toLowerCase(Locale.ROOT).contains("kqxs")) {
            modules.add("KQXS Broadcast UI");
            modules.add("Proxy/Theme config");
            modules.add("Lottery data entry");
        }
        if (scan.apiPatterns() != null) {
            for (String api : scan.apiPatterns()) {
                if (api != null && api.toLowerCase(Locale.ROOT).contains("helperapi")) {
                    modules.add("CSM helperApi integration");
                    break;
                }
            }
        }
        if (modules.isEmpty() && scan.symbols() != null) {
            for (String sym : scan.symbols()) {
                if (sym == null || sym.isBlank()) {
                    continue;
                }
                if (sym.startsWith("Fallback") || sym.equals("onKeyDown") || sym.equals("allow")) {
                    continue;
                }
                modules.add(sym);
                if (modules.size() >= 6) {
                    break;
                }
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
        if (codeScan != null && codeScan.lifecyclePatterns() != null) {
            boolean kqxs = codeScan.lifecyclePatterns().stream()
                .anyMatch(p -> p != null && (p.toLowerCase(Locale.ROOT).contains("kqxs")
                    || p.toLowerCase(Locale.ROOT).contains("autokqxs")));
            if (kqxs) {
                return "Module KQXS/broadcast xổ số — UI React động, cấu hình proxy/theme, nhập liệu và hiển thị kết quả";
            }
        }
        String domain = spec == null ? "" : String.valueOf(spec.domainSummary() == null ? "" : spec.domainSummary());
        if (domain.toLowerCase(Locale.ROOT).contains("kqxs")
            || domain.toLowerCase(Locale.ROOT).contains("autokqxs")) {
            return "Module KQXS/broadcast — quản lý hiển thị và luồng dữ liệu xổ số trên DynamicCode";
        }
        if (menuFlow) {
            return "Menu CSM — điều hướng module, form/list, trigger và lưu dữ liệu nghiệp vụ";
        }
        return "DynamicCode frontend — UI + tương tác + đồng bộ dữ liệu qua helperApi/recordManager";
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
        List<String> moduleNames = spec.modules() == null || spec.modules().isEmpty()
            ? List.of("Module chính")
            : spec.modules();
        int modules = Math.min(8, Math.max(menuSeedModuleCount, moduleNames.size()));
        List<Map<String, Object>> menu = new ArrayList<>();
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
        node.put("icon", "AppstoreOutlined");
        node.put("type_form", 1);
        node.put("row_type_edit", 0);
        node.put("table_name", table);
        node.put("table", buildSeedTableFields(moduleName));
        node.put("trigger", Map.of("load_db", "return (row) => true"));
        return node;
    }

    private List<Map<String, Object>> buildSeedTableFields(String moduleName) {
        List<Map<String, Object>> fields = new ArrayList<>();
        fields.add(seedField("id", "ID", "ed", 0, 1, 0));
        fields.add(seedField("ten", "Tên", "ed", 1, 0, 1));
        if (moduleName != null && moduleName.toLowerCase(Locale.ROOT).contains("trạng thái")) {
            fields.add(seedComboField("trang_thai", "Trạng thái", 2));
        }
        return fields;
    }

    private Map<String, Object> seedField(
        String name, String header, String types, int stt, int pkid, int show) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("f_name", name);
        field.put("f_header", header);
        field.put("f_types", types);
        field.put("f_show", show);
        field.put("f_stt", stt);
        field.put("f_pkid", pkid);
        field.put("f_width", pkid == 1 ? "80" : "200");
        field.put("f_dec", 0);
        field.put("f_align", "left");
        field.put("f_cbo_query", "");
        return field;
    }

    private Map<String, Object> seedComboField(String name, String header, int stt) {
        Map<String, Object> field = seedField(name, header, "co", stt, 0, 1);
        field.put("f_cbo_query",
            "{\"query\":[],\"options\":[{\"ma\":\"active\",\"ten\":\"Hoạt động\"},{\"ma\":\"inactive\",\"ten\":\"Ngưng\"}]}");
        return field;
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

    private List<String> extractModulesFromText(String text) {
        List<String> out = new ArrayList<>();
        String safe = String.valueOf(text == null ? "" : text).trim();
        if (safe.isBlank()) {
            return out;
        }
        String lower = safe.toLowerCase(Locale.ROOT)
            .replace('đ', 'd').replace('Đ', 'd');
        addNamedModuleIfContains(out, lower, safe, "xuat nhap ton", "Quản lý xuất nhập tồn");
        addNamedModuleIfContains(out, lower, safe, "xuất nhập tồn", "Quản lý xuất nhập tồn");
        addNamedModuleIfContains(out, lower, safe, "ban hang", "Quản lý bán hàng");
        addNamedModuleIfContains(out, lower, safe, "bán hàng", "Quản lý bán hàng");
        addNamedModuleIfContains(out, lower, safe, "cong no nha cung cap", "Công nợ nhà cung cấp");
        addNamedModuleIfContains(out, lower, safe, "công nợ nhà cung cấp", "Công nợ nhà cung cấp");
        addNamedModuleIfContains(out, lower, safe, "cong no khach hang", "Công nợ khách hàng");
        addNamedModuleIfContains(out, lower, safe, "công nợ khách hàng", "Công nợ khách hàng");
        addNamedModuleIfContains(out, lower, safe, "bao cao", "Báo cáo kinh doanh");
        addNamedModuleIfContains(out, lower, safe, "báo cáo", "Báo cáo kinh doanh");
        addNamedModuleIfContains(out, lower, safe, "ket qua kinh doanh", "Theo dõi kết quả kinh doanh");
        addNamedModuleIfContains(out, lower, safe, "kết quả kinh doanh", "Theo dõi kết quả kinh doanh");
        for (String segment : safe.split("[,;]+")) {
            String cleaned = segment.trim();
            if (cleaned.length() < 4) {
                continue;
            }
            String segLower = cleaned.toLowerCase(Locale.ROOT);
            if (segLower.contains("json menu")
                || segLower.contains("viết đầy đủ")
                || segLower.contains("viet day du")
                || segLower.contains("cho tôi")
                || segLower.contains("chương trình quản lý")
                || segLower.contains("chuong trinh quan ly")) {
                continue;
            }
            if (cleaned.length() > 72) {
                cleaned = cleaned.substring(0, 69) + "...";
            }
            if (!containsModuleLabel(out, cleaned)) {
                out.add(cleaned);
            }
            if (out.size() >= 8) {
                break;
            }
        }
        if (out.isEmpty()) {
            for (String token : List.of("module", "menu", "quản lý", "quan ly", "đơn hàng", "don hang", "khách hàng", "khach hang")) {
                if (lower.contains(token) && !out.contains(token)) {
                    out.add(token);
                }
            }
        }
        return out;
    }

    private void addNamedModuleIfContains(
            List<String> out,
            String lower,
            String original,
            String needle,
            String label) {
        if (lower.contains(needle) && !containsModuleLabel(out, label)) {
            out.add(label);
        }
    }

    private boolean containsModuleLabel(List<String> modules, String label) {
        String target = String.valueOf(label == null ? "" : label).trim().toLowerCase(Locale.ROOT);
        for (String module : modules) {
            if (String.valueOf(module == null ? "" : module).trim().toLowerCase(Locale.ROOT).equals(target)) {
                return true;
            }
        }
        return false;
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
