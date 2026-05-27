package net.phanmemmottrieu.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import net.phanmemmottrieu.service.AiLocalRuntimeTierService;
import net.phanmemmottrieu.service.AiMediaScriptRenderService;
import net.phanmemmottrieu.service.AiMediaStoryboardPlannerService;
import net.phanmemmottrieu.service.AiMediaTalkingPresenterRenderService;
import net.phanmemmottrieu.service.AiLocalPiperTtsService;
import net.phanmemmottrieu.service.AiLocalTalkingHeadService;
import net.phanmemmottrieu.service.AiCharacterExtractService;
import net.phanmemmottrieu.service.AiCharacterProfileService;
import net.phanmemmottrieu.service.AiMediaCharacterDirectorRenderService;
import net.phanmemmottrieu.service.AiMediaMartialCinematicRenderService;
import net.phanmemmottrieu.service.AiMediaTemplateProRenderService;
import net.phanmemmottrieu.service.MartialStoryboardTemplates;
import net.phanmemmottrieu.service.AiMultimodalScannerService;
import net.phanmemmottrieu.service.AiLocalOrchestrationService;
import net.phanmemmottrieu.service.AiBusinessMemoryVectorService;
import net.phanmemmottrieu.service.AiLocalEmbeddingService;
import net.phanmemmottrieu.service.AiTenantKnowledgeIngestionService;
import net.phanmemmottrieu.service.BundledFfmpegService;
import net.phanmemmottrieu.service.ComfyUIProcessService;
import net.phanmemmottrieu.service.LocalAiAssistantContextService;
import net.phanmemmottrieu.service.LlamaCppNativeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

@RestController
@RequestMapping({"/api/ai-local", "/ai-local"})
public class AiLocalOpsController {

    private static final int MAX_PATCH_TEXT_EDITS = 160;
    private static final int MAX_PATCH_REPLACEMENT_CHARS = 800000;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired(required = false)
    private LlamaCppNativeService llamaCppNativeService;

    @Autowired(required = false)
    private AiLocalOrchestrationService aiLocalOrchestrationService;

    @Autowired(required = false)
    private AiLocalRuntimeTierService aiLocalRuntimeTierService;

    @Autowired(required = false)
    private AiMultimodalScannerService aiMultimodalScannerService;

    @Autowired(required = false)
    private AiBusinessMemoryVectorService aiBusinessMemoryVectorService;

    @Autowired(required = false)
    private LocalAiAssistantContextService localAiAssistantContextService;

    @Autowired(required = false)
    private AiTenantKnowledgeIngestionService aiTenantKnowledgeIngestionService;

    @Autowired(required = false)
    private AiLocalEmbeddingService aiLocalEmbeddingService;

    @Autowired(required = false)
    private ComfyUIProcessService comfyUIProcessService;

    @Autowired(required = false)
    private AiMediaScriptRenderService aiMediaScriptRenderService;

    @Autowired(required = false)
    private AiMediaStoryboardPlannerService aiMediaStoryboardPlannerService;

    @Autowired(required = false)
    private AiCharacterExtractService aiCharacterExtractService;

    @Autowired(required = false)
    private AiMediaTemplateProRenderService aiMediaTemplateProRenderService;

    @Autowired(required = false)
    private AiMediaCharacterDirectorRenderService aiMediaCharacterDirectorRenderService;

    @Autowired(required = false)
    private AiMediaTalkingPresenterRenderService aiMediaTalkingPresenterRenderService;

    @Autowired(required = false)
    private AiMediaMartialCinematicRenderService aiMediaMartialCinematicRenderService;

    @Autowired(required = false)
    private AiLocalPiperTtsService aiLocalPiperTtsService;

    @Autowired(required = false)
    private AiLocalTalkingHeadService aiLocalTalkingHeadService;

    @Autowired(required = false)
    private AiCharacterProfileService aiCharacterProfileService;

    @Autowired(required = false)
    private BundledFfmpegService bundledFfmpegService;

    @Value("${ai.local.only.enabled:true}")
    private boolean aiLocalOnlyEnabled;

    @Value("${ai.orchestration.multimodal.local-only:true}")
    private boolean multimodalLocalOnly;

    @Value("${ai.orchestration.multimodal.local-only.require-vision:false}")
    private boolean multimodalRequireVision;

    @Value("${ai.local.llama.model-path:./csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf}")
    private String localModelPath;

    @Value("${ai.local.llama.runtime-profile:balanced}")
    private String runtimeProfile;

    @Value("${ai.local.llama.context-window:8192}")
    private int contextWindow;

    @Value("${ai.local.llama.max-tokens:512}")
    private int maxTokens;

    @Value("${ai.local.execute-plan.sse-timeout-ms:300000}")
    private long executePlanSseTimeoutMs;

    @Value("${ai.orchestration.multimodal.vision.enabled:false}")
    private boolean visionEnabled;

    @Value("${ai.orchestration.multimodal.vision.endpoint:}")
    private String visionEndpoint;

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> policy = new LinkedHashMap<>();
        Map<String, Object> reasoning = new LinkedHashMap<>();
        Map<String, Object> vision = new LinkedHashMap<>();

        boolean reasoningBeanPresent = llamaCppNativeService != null;
        boolean reasoningAvailable = reasoningBeanPresent && llamaCppNativeService.isAvailable();
        boolean reasoningHealthy = reasoningBeanPresent && llamaCppNativeService.isHealthy();
        boolean circuitOpen = reasoningBeanPresent && llamaCppNativeService.isCircuitOpen();

        boolean localVisionReady = aiLocalOrchestrationService != null && aiLocalOrchestrationService.isLocalVisionReady();

        policy.put("localOnlyEnabled", aiLocalOnlyEnabled);
        policy.put("multimodalLocalOnly", multimodalLocalOnly);
        policy.put("multimodalRequireVision", multimodalRequireVision);

        reasoning.put("provider", "llama.cpp-native");
        reasoning.put("beanPresent", reasoningBeanPresent);
        reasoning.put("available", reasoningAvailable);
        reasoning.put("healthy", reasoningHealthy);
        reasoning.put("circuitOpen", circuitOpen);
        reasoning.put("modelPath", localModelPath);
        reasoning.put("runtimeProfile", runtimeProfile);
        reasoning.put("contextWindow", contextWindow);
        reasoning.put("maxTokens", maxTokens);

        vision.put("enabled", visionEnabled);
        vision.put("endpoint", visionEndpoint == null ? "" : visionEndpoint);
        vision.put("localVisionReady", localVisionReady);

        Map<String, Object> ffmpeg = new LinkedHashMap<>();
        ffmpeg.put("provider", "jave-all-deps-bundled");
        ffmpeg.put("ready", bundledFfmpegService != null && bundledFfmpegService.isReady());
        ffmpeg.put("executablePath", bundledFfmpegService != null ? bundledFfmpegService.getExecutablePath() : "");

        Map<String, Object> characterExtract = new LinkedHashMap<>();
        if (aiCharacterExtractService != null) {
            characterExtract.putAll(aiCharacterExtractService.describeStatus());
        } else {
            characterExtract.put("provider", "onnxruntime-u2netp-bundled");
            characterExtract.put("ready", false);
        }

        out.put("success", true);
        out.put("policy", policy);
        if (aiLocalRuntimeTierService != null) {
            out.put("runtimeTier", aiLocalRuntimeTierService.describeRuntime());
        }
        out.put("reasoning", reasoning);
        out.put("vision", vision);
        out.put("ffmpeg", ffmpeg);
        out.put("characterExtract", characterExtract);
        if (aiLocalPiperTtsService != null) {
            out.put("tts", aiLocalPiperTtsService.describeStatus());
        }
        if (aiLocalTalkingHeadService != null) {
            out.put("talkingHead", aiLocalTalkingHeadService.describeStatus());
        }
        Map<String, Object> martial = new LinkedHashMap<>();
        martial.put("enabled", aiMediaMartialCinematicRenderService != null && aiMediaMartialCinematicRenderService.isEnabled());
        martial.put("engine", "martial_cinematic");
        martial.put("ready", aiMediaMartialCinematicRenderService != null && aiMediaMartialCinematicRenderService.isEnabled()
            && bundledFfmpegService != null && bundledFfmpegService.isReady()
            && aiCharacterExtractService != null && aiCharacterExtractService.isEnabled());
        out.put("martialCinematic", martial);
        out.put("ready", aiLocalOnlyEnabled && reasoningHealthy && (!multimodalRequireVision || localVisionReady));

        return ResponseEntity.ok(out);
    }

    @GetMapping("/models")
    public ResponseEntity<Map<String, Object>> models() {
        Map<String, Object> out = new LinkedHashMap<>();
        List<String> modelDirsChecked = resolveModelDirectories().stream().map(Path::toString).toList();
        List<Map<String, Object>> discovered = discoverLocalModelFiles();
        List<Map<String, Object>> reasoningCandidates = new ArrayList<>();
        List<Map<String, Object>> visionCandidates = new ArrayList<>();

        for (Map<String, Object> model : discovered) {
            String role = String.valueOf(model.get("role")).trim().toLowerCase(Locale.ROOT);
            if ("vision".equals(role)) {
                visionCandidates.add(model);
            } else {
                reasoningCandidates.add(model);
            }
        }

        if (reasoningCandidates.isEmpty()) {
            reasoningCandidates.add(modelCandidate(
                "qwen2.5-coder-0.5b-instruct-q4_k_m.gguf",
                "reasoning",
                "very-light",
                "~0.4-0.7GB",
                true,
                false,
                "q4_k_m"));
            reasoningCandidates.add(modelCandidate(
                "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
                "reasoning",
                "balanced",
                "~1.0-1.6GB",
                true,
                true,
                "q4_k_m"));
            reasoningCandidates.add(modelCandidate(
                "qwen2.5-coder-1.5b-instruct-q2_k.gguf",
                "reasoning",
                "ultra-low-ram",
                "~0.7-1.2GB",
                false,
                false,
                "q2_k"));
        }

        if (visionCandidates.isEmpty()) {
            visionCandidates.add(modelCandidate(
                "moondream2-q4_k_m.gguf",
                "vision",
                "very-light",
                "~0.5-0.9GB",
                true,
                false,
                "q4_k_m"));
            visionCandidates.add(modelCandidate(
                "qwen2-vl-2b-instruct-q4_k_m.gguf",
                "vision",
                "higher-quality",
                "~1.8-2.8GB",
                false,
                false,
                "q4_k_m"));
        }

        reasoningCandidates.sort((a, b) -> Integer.compare(
            toInt(b.get("weakMachineScore"), 0),
            toInt(a.get("weakMachineScore"), 0)
        ));
        visionCandidates.sort((a, b) -> Integer.compare(
            toInt(b.get("weakMachineScore"), 0),
            toInt(a.get("weakMachineScore"), 0)
        ));

        Map<String, Object> quantizationGuide = new LinkedHashMap<>();
        quantizationGuide.put("recommendedOrderWeakMachine", List.of("q4_k_m", "q2_k", "q4_0", "q5_k_m", "q8_0"));
        quantizationGuide.put("notes", List.of(
            "q4_k_m thường cân bằng tốt giữa chất lượng/tốc độ/RAM cho máy yếu",
            "q2_k tiết kiệm RAM hơn nhưng có thể giảm độ chính xác khi planning dài",
            "q8_0 chất lượng cao hơn nhưng tốn RAM đáng kể"
        ));

        out.put("success", true);
        out.put("localOnlyEnabled", aiLocalOnlyEnabled);
        out.put("configuredReasoningModel", localModelPath);
        out.put("configuredModelQuantization", detectQuantization(localModelPath));
        out.put("configuredModelExists", modelFileExists(localModelPath));
        out.put("modelDirectory", resolvePrimaryModelDirectory().toString());
        out.put("modelDirectoriesChecked", modelDirsChecked);
        out.put("discoveredCount", discovered.size());
        out.put("quantizationGuide", quantizationGuide);
        out.put("reasoningCandidates", reasoningCandidates);
        out.put("visionCandidates", visionCandidates);
        out.put("recommendedReasoningUnder2Gb", recommendByRamBudget(reasoningCandidates, 2.0, 3));
        out.put("recommendedVisionUnder2Gb", recommendByRamBudget(visionCandidates, 2.0, 2));

        return ResponseEntity.ok(out);
    }

    @GetMapping("/models/recommendations")
    public ResponseEntity<Map<String, Object>> modelRecommendations(
        @org.springframework.web.bind.annotation.RequestParam(value = "ramBudgetGb", required = false) Double ramBudgetGb,
        @org.springframework.web.bind.annotation.RequestParam(value = "includeVision", required = false) Boolean includeVision
    ) {
        double budget = ramBudgetGb == null ? 2.0 : Math.max(0.4, Math.min(16.0, ramBudgetGb));
        boolean withVision = includeVision != null && includeVision;

        List<Map<String, Object>> discovered = discoverLocalModelFiles();
        List<Map<String, Object>> reasoningCandidates = new ArrayList<>();
        List<Map<String, Object>> visionCandidates = new ArrayList<>();
        for (Map<String, Object> model : discovered) {
            String role = str(model.get("role")).toLowerCase(Locale.ROOT);
            if ("vision".equals(role)) {
                visionCandidates.add(model);
            } else {
                reasoningCandidates.add(model);
            }
        }

        reasoningCandidates.sort((a, b) -> Integer.compare(toInt(b.get("weakMachineScore"), 0), toInt(a.get("weakMachineScore"), 0)));
        visionCandidates.sort((a, b) -> Integer.compare(toInt(b.get("weakMachineScore"), 0), toInt(a.get("weakMachineScore"), 0)));

        List<Map<String, Object>> reasoningRecommended = recommendByRamBudget(reasoningCandidates, budget, 3);
        List<Map<String, Object>> visionRecommended = withVision
            ? recommendByRamBudget(visionCandidates, budget, 2)
            : List.of();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("localOnlyEnabled", aiLocalOnlyEnabled);
        out.put("ramBudgetGb", budget);
        out.put("includeVision", withVision);
        out.put("reasoningRecommended", reasoningRecommended);
        out.put("visionRecommended", visionRecommended);
        out.put("quantizationPriorityWeakMachine", List.of("q4_k_m", "q2_k", "q4_0", "q5_k_m", "q8_0"));
        out.put("notes", List.of(
            "Với máy yếu nên ưu tiên q4_k_m trước, sau đó q2_k khi thiếu RAM.",
            "Ưu tiên 0.5B/1.1B/1.5B cho reasoning để giữ RAM dưới ngưỡng.",
            "Vision model chỉ bật khi cần quét ảnh để giảm tải tổng thể."
        ));
        return ResponseEntity.ok(out);
    }

    @GetMapping("/knowledge/status")
    public ResponseEntity<Map<String, Object>> knowledgeStatus() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("knowledgeBaseDir", resolveKnowledgeBaseDir().toString());
        if (localAiAssistantContextService != null) {
            out.put("workspaceIndex", localAiAssistantContextService.describeWorkspaceIndexStatus());
        }
        if (aiLocalEmbeddingService != null) {
            out.put("embedding", aiLocalEmbeddingService.getStats());
        } else if (aiBusinessMemoryVectorService != null) {
            out.put("embedding", Map.of("note", "AiLocalEmbeddingService unavailable"));
        }
        out.put("businessMemoryIndexDir", resolveBusinessMemoryDir().toString());
        out.put("menuLearningFiles", listMenuLearningFiles());
        out.put("authorStyleDnaPath", resolveKnowledgeBaseDir().resolve("author_style_dna.md").toString());
        out.put("authorStyleDnaExists", Files.isRegularFile(resolveKnowledgeBaseDir().resolve("author_style_dna.md")));
        return ResponseEntity.ok(out);
    }

    @PostMapping("/knowledge/rebuild-workspace")
    public ResponseEntity<Map<String, Object>> rebuildWorkspaceKnowledge(
        @org.springframework.web.bind.annotation.RequestParam(value = "fullCode", defaultValue = "true") boolean fullCode,
        @org.springframework.web.bind.annotation.RequestParam(value = "appId", defaultValue = "csm") String appId
    ) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (localAiAssistantContextService == null) {
            out.put("success", false);
            out.put("errorCode", "WORKSPACE_INDEX_UNAVAILABLE");
            return ResponseEntity.ok(out);
        }
        Map<String, Object> workspace = localAiAssistantContextService.forceRebuildWorkspaceIndex(fullCode);
        out.put("success", true);
        out.put("fullCodeScan", fullCode);
        out.put("workspaceIndex", workspace);
        if (aiTenantKnowledgeIngestionService != null) {
            out.put("tenantKnowledge", aiTenantKnowledgeIngestionService.ingestTenantKnowledge(appId));
        }
        out.put("note", fullCode
            ? "Full code scan indexed into workspace Lucene. Export pack with scripts/csm-knowledge-pack.sh export"
            : "Markdown-only workspace index rebuilt");
        return ResponseEntity.ok(out);
    }

    @PostMapping("/knowledge/ingest-tenant")
    public ResponseEntity<Map<String, Object>> ingestTenantKnowledge(
        @org.springframework.web.bind.annotation.RequestParam(value = "appId", defaultValue = "csm") String appId
    ) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (aiTenantKnowledgeIngestionService == null) {
            out.put("success", false);
            out.put("errorCode", "TENANT_INGEST_UNAVAILABLE");
            return ResponseEntity.ok(out);
        }
        out.put("success", true);
        out.put("result", aiTenantKnowledgeIngestionService.ingestTenantKnowledge(appId));
        return ResponseEntity.ok(out);
    }

    private Path resolveKnowledgeBaseDir() {
        Path cwd = Paths.get(System.getProperty("user.dir", ".")).toAbsolutePath().normalize();
        Path direct = cwd.resolve("csm_datas/ai_local");
        if (Files.isDirectory(direct)) {
            return direct;
        }
        return cwd.resolve("backend/csm_datas/ai_local").normalize();
    }

    private Path resolveBusinessMemoryDir() {
        Path base = resolveKnowledgeBaseDir();
        Path nested = base.resolve("ai_business_memory");
        if (Files.isDirectory(nested)) {
            return nested;
        }
        return base.resolve("ai_business_memory");
    }

    private List<String> listMenuLearningFiles() {
        try {
            Path base = resolveKnowledgeBaseDir();
            if (!Files.isDirectory(base)) {
                return List.of();
            }
            try (Stream<Path> stream = Files.list(base)) {
                return stream
                    .filter(Files::isRegularFile)
                    .map(path -> path.getFileName().toString())
                    .filter(name -> name.startsWith("ai_menu_learning_") && name.endsWith(".jsonl"))
                    .sorted()
                    .toList();
            }
        } catch (Exception ignored) {
            return List.of();
        }
    }

    @PostMapping("/scan-dry-run")
    public ResponseEntity<Map<String, Object>> scanDryRun(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> request = body == null ? Collections.emptyMap() : body;
        Map<String, Object> out = new LinkedHashMap<>();

        if (aiMultimodalScannerService == null) {
            out.put("success", false);
            out.put("errorCode", "SCANNER_UNAVAILABLE");
            out.put("message", "AiMultimodalScannerService bean unavailable");
            return ResponseEntity.ok(out);
        }

        String message = str(request.get("message"));
        String contextType = normalizeOrDefault(request.get("contextType"), "code");
        String taskType = normalizeOrDefault(request.get("taskType"), "edit");
        String responseMode = normalizeOrDefault(request.get("responseMode"), "edit");
        List<Map<String, Object>> attachments = normalizeAttachments(request.get("attachments"));

        AiMultimodalScannerService.ScanResult scanResult = aiMultimodalScannerService.scan(
            message,
            attachments,
            contextType,
            taskType,
            responseMode
        );

        List<Map<String, Object>> ingestCandidates = new ArrayList<>();
        if (scanResult.decisions() != null) {
            for (AiMultimodalScannerService.ScanDecision decision : scanResult.decisions()) {
                if (decision == null || !decision.shouldIngest()) {
                    continue;
                }
                Map<String, Object> candidate = new LinkedHashMap<>();
                candidate.put("sourceId", decision.sourceId());
                candidate.put("kind", decision.kind());
                candidate.put("priority", decision.priority());
                candidate.put("scopeMask", decision.scopeMask());
                candidate.put("scopeTags", AiMultimodalScannerService.scopeTagsFromMask(Math.max(0, decision.scopeMask())));
                candidate.put("reason", decision.reason());
                ingestCandidates.add(candidate);
            }
        }

        List<Map<String, Object>> planSteps = new ArrayList<>();
        planSteps.add(planStep(
            "Step_1",
            "scanner",
            "Quét ảnh/JSON để sinh technical summary và scope bitmask",
            "done"
        ));
        planSteps.add(planStep(
            "Step_2",
            "dynamic_ingestion",
            "Lập kế hoạch nạp dynamic context vào Lucene (dry-run, không ghi dữ liệu thật)",
            scanResult.ingestCount() > 0 ? "ready" : "skipped"
        ));
        planSteps.add(planStep(
            "Step_3",
            "rag_planning",
            "Chuẩn bị scoped-RAG query theo aggregate scope mask",
            scanResult.aggregateScopeMask() > 0 ? "ready" : "ready"
        ));
        planSteps.add(planStep(
            "Step_4",
            "execution_streaming",
            "Sinh patch/steps để stream lên CodeMirror theo thứ tự thực thi",
            "ready"
        ));

        Map<String, Object> scanner = new LinkedHashMap<>();
        scanner.put("enabled", scanResult.enabled());
        scanner.put("attachmentCount", scanResult.attachmentCount());
        scanner.put("imageCount", scanResult.imageCount());
        scanner.put("jsonCount", scanResult.jsonCount());
        scanner.put("ingestCount", scanResult.ingestCount());
        scanner.put("aggregateScopeMask", scanResult.aggregateScopeMask());
        scanner.put("aggregateScopeTags", AiMultimodalScannerService.scopeTagsFromMask(Math.max(0, scanResult.aggregateScopeMask())));
        scanner.put("planningHints", scanResult.planningHints());
        scanner.put("compactContext", scanResult.compactContext());
        scanner.put("ingestionMarkdown", scanResult.ingestionMarkdown());
        scanner.put("decisions", scanResult.decisions());

        Map<String, Object> policy = new LinkedHashMap<>();
        policy.put("localOnlyEnabled", aiLocalOnlyEnabled);
        policy.put("multimodalLocalOnly", multimodalLocalOnly);
        policy.put("multimodalRequireVision", multimodalRequireVision);

        out.put("success", true);
        out.put("mode", "dry-run");
        out.put("localOnly", true);
        out.put("contextType", contextType);
        out.put("taskType", taskType);
        out.put("responseMode", responseMode);
        out.put("policy", policy);
        out.put("scanner", scanner);
        out.put("ingestCandidates", ingestCandidates);
        out.put("plan", planSteps);
        out.put("note", "Dry-run only: phân tích ảnh/kịch bản — KHÔNG xuất file ảnh/video. Dùng POST /ai-local/render-media-script để render file thật.");

        return ResponseEntity.ok(out);
    }

    @PostMapping("/plan-media-storyboard")
    public ResponseEntity<Map<String, Object>> planMediaStoryboard(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> request = body == null ? Collections.emptyMap() : body;
        Map<String, Object> out = new LinkedHashMap<>();
        if (aiMediaStoryboardPlannerService == null || !aiMediaStoryboardPlannerService.isEnabled()) {
            out.put("success", false);
            out.put("errorCode", "PLANNER_UNAVAILABLE");
            out.put("message", "Storyboard planner chưa bật");
            return ResponseEntity.ok(out);
        }
        String message = str(request.get("message"));
        int durationSec = parseIntSafe(request.get("durationSec"), 15);
        String characterHint = str(request.get("characterHint"));
        Map<String, Object> characterProfile = null;
        ImageAttachment img = resolveFirstImageAttachment(request, aiMediaScriptRenderService);
        if (img.bytes().length > 0 && aiCharacterProfileService != null) {
            characterProfile = aiCharacterProfileService.analyze(img.bytes(), img.mime(), message);
            out.put("characterProfile", characterProfile);
        }
        AiMediaStoryboardPlannerService.StoryboardPlan plan = aiMediaStoryboardPlannerService.plan(
            message, characterHint, durationSec, characterProfile);
        out.putAll(plan.toMap());
        out.put("lane", "media_storyboard");
        return ResponseEntity.ok(out);
    }

    @PostMapping("/plan-martial-storyboard")
    public ResponseEntity<Map<String, Object>> planMartialStoryboard(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> request = body == null ? Collections.emptyMap() : body;
        Map<String, Object> out = new LinkedHashMap<>();
        if (aiMediaMartialCinematicRenderService == null || !aiMediaMartialCinematicRenderService.isEnabled()) {
            out.put("success", false);
            out.put("errorCode", "MARTIAL_UNAVAILABLE");
            out.put("message", "Martial cinematic chưa bật");
            return ResponseEntity.ok(out);
        }
        String message = str(request.get("message"));
        int durationSec = parseIntSafe(request.get("durationSec"), 18);
        MartialStoryboardTemplates.MartialPlan plan = aiMediaMartialCinematicRenderService.planStoryboard(message, durationSec);
        out.putAll(plan.toMap());
        out.put("lane", "martial_storyboard");
        out.put("hint", "Template 4 cảnh cố định — rooftop neon, dodge, combo, hero. Không cần LLM.");
        return ResponseEntity.ok(out);
    }

    @PostMapping("/extract-character")
    public ResponseEntity<Map<String, Object>> extractCharacter(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> request = body == null ? Collections.emptyMap() : body;
        Map<String, Object> out = new LinkedHashMap<>();
        if (aiCharacterExtractService == null || !aiCharacterExtractService.isEnabled()) {
            out.put("success", false);
            out.put("errorCode", "EXTRACT_UNAVAILABLE");
            out.put("message", "Character extract chưa bật");
            return ResponseEntity.ok(out);
        }
        String appId = normalizeOrDefault(request.get("appId"), "csm");
        ImageAttachment img = resolveFirstImageAttachment(request, aiMediaScriptRenderService);
        if (img.bytes().length == 0) {
            out.put("success", false);
            out.put("errorCode", "MISSING_IMAGE");
            out.put("message", "Thiếu attachments[0] ảnh nhân vật");
            return ResponseEntity.ok(out);
        }
        AiCharacterExtractService.ExtractResult result = aiCharacterExtractService.extract(img.bytes(), img.mime(), appId);
        out.putAll(result.toMap());
        out.put("lane", "character_extract");
        out.put("hint", "Character cutout bundled ONNX u2netp — model tự tải lần đầu vào csm_datas/models/u2netp.onnx");
        return ResponseEntity.ok(out);
    }

    @PostMapping("/render-media-script")
    public ResponseEntity<Map<String, Object>> renderMediaScript(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> request = body == null ? Collections.emptyMap() : body;
        Map<String, Object> out = new LinkedHashMap<>();

        String renderEngine = normalizeOrDefault(request.get("renderEngine"), "talking_presenter").toLowerCase(Locale.ROOT);
        boolean engineUpgraded = "template_pro".equals(renderEngine);
        if (engineUpgraded) {
            renderEngine = "talking_presenter";
        }
        String message = str(request.get("message"));
        String outputMode = normalizeOrDefault(request.get("outputMode"), "both");
        String appId = normalizeOrDefault(request.get("appId"), "csm");
        int durationSec = parseIntSafe(request.get("durationSec"), 15);
        ImageAttachment img = resolveFirstImageAttachment(request, aiMediaScriptRenderService);

        if ("talking_presenter".equals(renderEngine) || "talking".equals(renderEngine)) {
            if (aiMediaTalkingPresenterRenderService == null) {
                out.put("success", false);
                out.put("errorCode", "TALKING_PRESENTER_UNAVAILABLE");
                out.put("message", "AiMediaTalkingPresenterRenderService không khả dụng");
                return ResponseEntity.ok(out);
            }
            if (img.bytes().length == 0) {
                out.put("success", false);
                out.put("errorCode", "MISSING_IMAGE");
                out.put("message", "Thiếu ảnh nhân vật (attachments[0])");
                return ResponseEntity.ok(out);
            }
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> scenes = request.get("storyboardScenes") instanceof List<?> list
                ? (List<Map<String, Object>>) list
                : null;

            AiMediaTalkingPresenterRenderService.PresenterResult pr = aiMediaTalkingPresenterRenderService.render(
                new AiMediaTalkingPresenterRenderService.PresenterRequest(
                    message, outputMode, appId, durationSec,
                    img.bytes(), img.mime(), scenes
                )
            );
            out.putAll(pr.toMap());
            if (pr.success()) {
                out.put("lane", "media_render");
                if (engineUpgraded) {
                    out.put("engineUpgraded", true);
                    out.put("engineUpgradeNote", "template_pro → talking_presenter");
                }
                out.put("hint", "S3 Talking Presenter — TTS local + nhân vật nói dialogue từng cảnh (ai-talk-*.mp4)");
            }
            return ResponseEntity.ok(out);
        }

        if ("martial_cinematic".equals(renderEngine) || "martial".equals(renderEngine)) {
            if (aiMediaMartialCinematicRenderService == null || !aiMediaMartialCinematicRenderService.isEnabled()) {
                out.put("success", false);
                out.put("errorCode", "MARTIAL_UNAVAILABLE");
                out.put("message", "AiMediaMartialCinematicRenderService không khả dụng hoặc chưa bật");
                return ResponseEntity.ok(out);
            }
            if (img.bytes().length == 0) {
                out.put("success", false);
                out.put("errorCode", "MISSING_IMAGE");
                out.put("message", "Thiếu ảnh nhân vật (attachments[0])");
                return ResponseEntity.ok(out);
            }
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> scenes = request.get("storyboardScenes") instanceof List<?> list
                ? (List<Map<String, Object>>) list
                : null;

            AiMediaMartialCinematicRenderService.MartialResult mr = aiMediaMartialCinematicRenderService.render(
                new AiMediaMartialCinematicRenderService.MartialRequest(
                    message, outputMode, appId, durationSec,
                    img.bytes(), img.mime(), scenes
                )
            );
            out.putAll(mr.toMap());
            if (mr.success()) {
                out.put("lane", "media_render");
                out.put("hint", "Martial cinematic — cutout + rooftop Java2D + FFmpeg motion (ai-martial-*.mp4)");
            }
            return ResponseEntity.ok(out);
        }

        if ("character_director".equals(renderEngine)) {
            if (aiMediaCharacterDirectorRenderService == null) {
                out.put("success", false);
                out.put("errorCode", "CHARACTER_DIRECTOR_UNAVAILABLE");
                out.put("message", "AiMediaCharacterDirectorRenderService không khả dụng");
                return ResponseEntity.ok(out);
            }
            if (img.bytes().length == 0) {
                out.put("success", false);
                out.put("errorCode", "MISSING_IMAGE");
                out.put("message", "Thiếu ảnh nhân vật (attachments[0])");
                return ResponseEntity.ok(out);
            }
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> scenes = request.get("storyboardScenes") instanceof List<?> list
                ? (List<Map<String, Object>>) list
                : null;

            AiMediaCharacterDirectorRenderService.DirectorResult dr = aiMediaCharacterDirectorRenderService.render(
                new AiMediaCharacterDirectorRenderService.DirectorRequest(
                    message, outputMode, appId, durationSec,
                    img.bytes(), img.mime(), scenes, null
                )
            );
            out.putAll(dr.toMap());
            if (dr.success()) {
                out.put("lane", "media_render");
                if (engineUpgraded) {
                    out.put("engineUpgraded", true);
                    out.put("engineUpgradeNote", "template_pro → character_director");
                }
                out.put("hint", "Character Director — AI nhận diện nhân vật + storyboard hành động + animate cutout theo dialogue từng cảnh");
            }
            return ResponseEntity.ok(out);
        }

        if ("template_pro".equals(renderEngine)) {
            if (aiMediaTemplateProRenderService == null) {
                out.put("success", false);
                out.put("errorCode", "TEMPLATE_PRO_UNAVAILABLE");
                out.put("message", "AiMediaTemplateProRenderService không khả dụng");
                return ResponseEntity.ok(out);
            }
            if (img.bytes().length == 0) {
                out.put("success", false);
                out.put("errorCode", "MISSING_IMAGE");
                out.put("message", "Thiếu ảnh nhân vật (attachments[0])");
                return ResponseEntity.ok(out);
            }
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> scenes = request.get("storyboardScenes") instanceof List<?> list
                ? (List<Map<String, Object>>) list
                : null;

            AiMediaTemplateProRenderService.TemplateProResult tp = aiMediaTemplateProRenderService.render(
                new AiMediaTemplateProRenderService.TemplateProRequest(
                    message,
                    outputMode,
                    appId,
                    durationSec,
                    img.bytes(),
                    img.mime(),
                    scenes,
                    null
                )
            );
            out.putAll(tp.toMap());
            if (tp.success()) {
                out.put("lane", "media_render");
                out.put("hint", "Template Pro — multi-scene + character compositor + FFmpeg concat");
            }
            return ResponseEntity.ok(out);
        }

        if (aiMediaScriptRenderService == null || !aiMediaScriptRenderService.isEnabled()) {
            out.put("success", false);
            out.put("errorCode", "RENDER_UNAVAILABLE");
            out.put("message", "AiMediaScriptRenderService chưa bật hoặc không khả dụng");
            return ResponseEntity.ok(out);
        }

        if (img.bytes().length == 0) {
            out.put("success", false);
            out.put("errorCode", "MISSING_IMAGE");
            out.put("message", "Thiếu ảnh nhân vật (attachments[0].base64Data)");
            return ResponseEntity.ok(out);
        }

        AiMediaScriptRenderService.RenderResult result = aiMediaScriptRenderService.render(
            new AiMediaScriptRenderService.RenderRequest(
                message,
                outputMode,
                appId,
                durationSec,
                img.bytes(),
                img.mime(),
                img.name()
            )
        );

        out.putAll(result.toMap());
        if (result.success()) {
            out.put("lane", "media_render");
            out.put("renderEngine", "slideshow");
            out.put("aiVideoGeneration", Map.of(
                "available", false,
                "reason", "slideshow 1 frame — dùng renderEngine=template_pro cho multi-scene",
                "comfyuiConfigured", comfyUIProcessService != null && comfyUIProcessService.isConfigured(),
                "comfyuiAvailable", comfyUIProcessService != null && comfyUIProcessService.isAvailable()
            ));
            out.put("hint", "File lưu tại public/app_images — mở imageUrl/videoUrl trên domain web");
        }
        return ResponseEntity.ok(out);
    }

    private record ImageAttachment(byte[] bytes, String mime, String name) {}

    private ImageAttachment resolveFirstImageAttachment(Map<String, Object> request, AiMediaScriptRenderService renderService) {
        List<Map<String, Object>> attachments = normalizeAttachments(request.get("attachments"));
        byte[] imageBytes = new byte[0];
        String imageMime = "image/jpeg";
        String imageName = "character.jpg";
        for (Map<String, Object> att : attachments) {
            if (att == null) continue;
            String kind = str(att.get("kind")).toLowerCase(Locale.ROOT);
            String type = str(att.get("type")).toLowerCase(Locale.ROOT);
            String mime = str(att.get("mimeType"));
            if (!"image".equals(kind) && !type.contains("image") && !mime.startsWith("image/")) {
                continue;
            }
            String base64Data = str(att.get("base64Data"));
            if (base64Data.isBlank()) {
                base64Data = str(att.get("dataUrl"));
            }
            if (renderService != null) {
                imageBytes = renderService.decodeBase64Image(base64Data);
            } else {
                imageBytes = decodeBase64ImageFallback(base64Data);
            }
            if (!mime.isBlank()) imageMime = mime;
            if (!str(att.get("name")).isBlank()) imageName = str(att.get("name"));
            break;
        }
        return new ImageAttachment(imageBytes, imageMime, imageName);
    }

    private byte[] decodeBase64ImageFallback(String raw) {
        String value = String.valueOf(raw == null ? "" : raw).trim();
        if (value.isBlank()) return new byte[0];
        int comma = value.indexOf(',');
        if (value.startsWith("data:") && comma > 0) {
            value = value.substring(comma + 1);
        }
        return java.util.Base64.getDecoder().decode(value.replaceAll("\\s+", ""));
    }

    @PostMapping(value = "/execute-local-plan", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter executeLocalPlan(@RequestBody(required = false) Map<String, Object> body) {
        SseEmitter emitter = new SseEmitter(Math.max(120_000L, executePlanSseTimeoutMs));
        Map<String, Object> request = body == null ? Collections.emptyMap() : body;

        emitter.onTimeout(emitter::complete);
        emitter.onError(ex -> emitter.complete());

        Thread worker = new Thread(() -> {
            try {
                if (aiMultimodalScannerService == null) {
                    sendSse(emitter, Map.of(
                        "stage", "error",
                        "status", "error",
                        "reason_code", "scanner_unavailable",
                        "message", "AiMultimodalScannerService unavailable for execute-local-plan"
                    ));
                    emitter.complete();
                    return;
                }

                String message = str(request.get("message"));
                String appId = normalizeOrDefault(request.get("appId"), "csm");
                String contextType = normalizeOrDefault(request.get("contextType"), "code");
                String taskType = normalizeOrDefault(request.get("taskType"), "edit");
                String responseMode = normalizeOrDefault(request.get("responseMode"), "edit");
                boolean applyDynamicIngestion = parseBoolean(request.get("applyDynamicIngestion"), false);
                boolean executePatch = parseBoolean(request.get("executePatch"), "edit".equalsIgnoreCase(responseMode));
                String currentCode = String.valueOf(request.get("currentCode") == null ? "" : request.get("currentCode"));
                String requestId = str(request.get("requestId"));
                if (requestId.isBlank()) {
                    requestId = "local-" + System.currentTimeMillis();
                }
                List<Map<String, Object>> attachments = normalizeAttachments(request.get("attachments"));

                AiMultimodalScannerService.ScanResult scanResult = aiMultimodalScannerService.scan(
                    message,
                    attachments,
                    contextType,
                    taskType,
                    responseMode
                );

                sendSse(emitter, Map.of(
                    "stage", "preparing",
                    "status", "running",
                    "message", "Bắt đầu local execute plan",
                    "current", 0,
                    "total", 5,
                    "percent", 5,
                    "responseMode", responseMode
                ));

                Map<String, Object> agenticPlan = new LinkedHashMap<>();
                agenticPlan.put("stage", "agentic_plan");
                agenticPlan.put("status", "running");
                agenticPlan.put("message", "Đã lập kế hoạch Agentic local từ scanner signals");
                agenticPlan.put("current", 1);
                agenticPlan.put("total", 5);
                agenticPlan.put("percent", 20);
                agenticPlan.put("compacted", true);
                agenticPlan.put("savedChars", Math.max(0, scanResult.compactContext().length() - 1500));
                agenticPlan.put("charsBefore", scanResult.ingestionMarkdown().length());
                agenticPlan.put("charsAfter", scanResult.compactContext().length());
                agenticPlan.put("planStepCount", 4);
                agenticPlan.put("scopeMask", scanResult.aggregateScopeMask());
                agenticPlan.put("scopeSummary", "scanner_scope_mask=" + scanResult.aggregateScopeMask());
                sendSse(emitter, agenticPlan);

                sendSse(emitter, Map.of(
                    "stage", "scope_reasoning",
                    "status", "running",
                    "message", "Khóa phạm vi reasoning bằng bitmask",
                    "current", 2,
                    "total", 5,
                    "percent", 40,
                    "scopeMask", scanResult.aggregateScopeMask(),
                    "scopeSummary", "bitmask_scoped_retrieval",
                    "scopeTags", AiMultimodalScannerService.scopeTagsFromMask(Math.max(0, scanResult.aggregateScopeMask())),
                    "responseMode", responseMode
                ));

                if (scanResult.ingestCount() > 0) {
                    boolean persisted = false;
                    int prunedSources = 0;
                    String dynamicSource = "dry_run_scanner";
                    String ingestMessage = "Dynamic context queued (dry-run)";
                    if (applyDynamicIngestion && aiBusinessMemoryVectorService != null) {
                        String sourceSuffix = "scan_" + System.currentTimeMillis();
                        dynamicSource = sourceSuffix;
                        String ingestMarkdown = String.valueOf(scanResult.ingestionMarkdown() == null ? "" : scanResult.ingestionMarkdown()).trim();
                        if (!ingestMarkdown.isBlank()) {
                            aiBusinessMemoryVectorService.indexDynamicContext(
                                appId,
                                sourceSuffix,
                                ingestMarkdown,
                                scanResult.planningHints(),
                                Math.max(0, scanResult.aggregateScopeMask())
                            );
                            prunedSources = aiBusinessMemoryVectorService.pruneDynamicContext(appId);
                            persisted = true;
                            ingestMessage = "Dynamic context queued and persisted to Lucene";
                        }
                    }
                    Map<String, Object> queuedIngestion = new LinkedHashMap<>();
                    queuedIngestion.put("stage", "dynamic_ingestion");
                    queuedIngestion.put("status", "queued");
                    queuedIngestion.put("message", ingestMessage);
                    queuedIngestion.put("current", 3);
                    queuedIngestion.put("total", 5);
                    queuedIngestion.put("percent", 60);
                    queuedIngestion.put("queueState", "queued");
                    queuedIngestion.put("dynamicSource", dynamicSource);
                    queuedIngestion.put("persisted", persisted);
                    queuedIngestion.put("scopeMask", scanResult.aggregateScopeMask());
                    queuedIngestion.put("scopeSummary", "dry_run_ingestion");
                    queuedIngestion.put("responseMode", responseMode);
                    sendSse(emitter, queuedIngestion);
                    sendSse(emitter, Map.of(
                        "stage", "dynamic_ingestion",
                        "status", "indexed",
                        "message", persisted ? "Dynamic context indexed in Lucene" : "Dynamic context indexed (simulated)",
                        "queueState", "indexed",
                        "dynamicSource", dynamicSource,
                        "prunedSources", prunedSources,
                        "persisted", persisted,
                        "scopeMask", scanResult.aggregateScopeMask(),
                        "scopeSummary", "dry_run_ingestion",
                        "responseMode", responseMode
                    ));
                }

                sendSse(emitter, Map.of(
                    "stage", "local_tool_invocation",
                    "status", "running",
                    "message", "Local tools tạo execution sketch theo từng bước",
                    "current", 4,
                    "total", 5,
                    "percent", 80,
                    "detail", "steps=4, ingestCandidates=" + scanResult.ingestCount(),
                    "responseMode", responseMode
                ));

                sendSse(emitter, Map.of(
                    "stage", "context_compression",
                    "status", "running",
                    "message", "Đã nén context và chuẩn bị stream patch",
                    "current", 5,
                    "total", 5,
                    "percent", 100,
                    "responseMode", responseMode
                ));

                String fullResponse = "";
                if (shouldUseLocalComfyUI(attachments, message)) {
                    long comfyStartAt = System.currentTimeMillis();
                    sendSse(emitter, Map.of(
                        "stage", "local_comfyui",
                        "status", "running",
                        "message", "Đang khởi chạy ComfyUI + LTX-Video local...",
                        "current", 4,
                        "total", 5,
                        "percent", 80,
                        "model", "comfyui_local"
                    ));

                    String comfyResponse = comfyUIProcessService.processRequest(message);
                    if (comfyResponse == null || comfyResponse.isBlank()) {
                        sendSse(emitter, Map.of(
                            "stage", "error",
                            "status", "error",
                            "reason_code", "comfyui_empty_output",
                            "message", "ComfyUI không trả về kết quả hợp lệ."
                        ));
                        emitter.complete();
                        return;
                    }

                    sendSse(emitter, Map.of(
                        "stage", "streaming_started",
                        "status", "running",
                        "message", "ComfyUI local đã trả kết quả, đang stream...",
                        "requestId", requestId,
                        "model", "local_provider",
                        "ttftMs", 0,
                        "estimatedTotalChars", comfyResponse.length(),
                        "percent", 12
                    ));

                    int streamChunks = emitSyntheticLocalStreamChunks(
                        emitter,
                        requestId,
                        comfyResponse,
                        1,
                        false,
                        true);

                    Map<String, Object> completePayload = new LinkedHashMap<>();
                    completePayload.put("stage", "complete");
                    completePayload.put("status", "done");
                    completePayload.put("message", "ComfyUI local đã hoàn tất");
                    completePayload.put("responseMode", responseMode);
                    completePayload.put("contextType", contextType);
                    completePayload.put("model", "local_provider");
                    completePayload.put("localProviderPrimaryUsed", true);
                    completePayload.put("flowConfirmedByLocal", true);
                    completePayload.put("elapsedMs", Math.max(0, System.currentTimeMillis() - comfyStartAt));
                    completePayload.put("fullResponse", comfyResponse);
                    completePayload.put("outputChars", comfyResponse.length());
                    completePayload.put("textEditsCount", 0);
                    completePayload.put("streamChunkCount", streamChunks);
                    completePayload.put("streamedChars", comfyResponse.length());
                    completePayload.put("result", Map.of("appId", appId));
                    sendSse(emitter, completePayload);
                    emitter.complete();
                    return;
                }
                if (executePatch && "code".equalsIgnoreCase(contextType) && !currentCode.isBlank()) {
                    long executeStartedAt = System.currentTimeMillis();
                    sendSse(emitter, Map.of(
                        "stage", "streaming_started",
                        "status", "running",
                        "message", "Bắt đầu sinh patch local (llama.cpp)",
                        "responseMode", responseMode,
                        "contextType", contextType,
                        "model", "local_provider"
                    ));

                    String patchPrompt = buildLocalPatchPrompt(
                        message,
                        currentCode,
                        scanResult.compactContext(),
                        scanResult.planningHints()
                    );
                    LocalExecutionResult localResult = runLocalPatchGeneration(patchPrompt);
                    if (localResult.success() && !localResult.output().isBlank()) {
                        LocalPatchValidationResult validation = validateLocalPatchPayload(localResult.output(), currentCode);
                        if (!validation.success()) {
                            String safeNoOpPayload = buildSafeNoOpPayload(validation.reasonCode(), validation.message());
                            sendSse(emitter, Map.of(
                                "stage", "streaming",
                                "status", "running",
                                "message", "Patch local không đạt quality gate, fallback sang no-op an toàn",
                                "chunk", safeNoOpPayload,
                                "responseMode", responseMode,
                                "contextType", contextType,
                                "model", "local_provider"
                            ));
                            sendSse(emitter, Map.of(
                                "stage", "streaming_progress",
                                "status", "running",
                                "message", "Fallback no-op payload đã sẵn sàng",
                                "percent", 96,
                                "charsReceived", safeNoOpPayload.length(),
                                "responseMode", responseMode,
                                "contextType", contextType
                            ));

                            long elapsedMs = Math.max(0L, System.currentTimeMillis() - executeStartedAt);
                            Map<String, Object> completeResult = new LinkedHashMap<>();
                            completeResult.put("appId", appId);
                            completeResult.put("applyDynamicIngestion", applyDynamicIngestion);
                            completeResult.put("ingestCount", scanResult.ingestCount());
                            completeResult.put("aggregateScopeMask", scanResult.aggregateScopeMask());
                            completeResult.put("scopeTags", AiMultimodalScannerService.scopeTagsFromMask(Math.max(0, scanResult.aggregateScopeMask())));
                            completeResult.put("planningHints", scanResult.planningHints());
                            completeResult.put("patchFallbackNoOp", true);
                            completeResult.put("patchFallbackReasonCode", validation.reasonCode());

                            Map<String, Object> completePayload = new LinkedHashMap<>();
                            completePayload.put("stage", "complete");
                            completePayload.put("status", "done");
                            completePayload.put("message", "Local execute plan hoàn tất với no-op fallback");
                            completePayload.put("responseMode", responseMode);
                            completePayload.put("contextType", contextType);
                            completePayload.put("model", "local_provider");
                            completePayload.put("localProviderPrimaryUsed", true);
                            completePayload.put("flowConfirmedByLocal", true);
                            completePayload.put("elapsedMs", elapsedMs);
                            completePayload.put("fullResponse", safeNoOpPayload);
                            completePayload.put("outputChars", safeNoOpPayload.length());
                            completePayload.put("textEditsCount", 0);
                            completePayload.put("streamChunkCount", 1);
                            completePayload.put("streamedChars", safeNoOpPayload.length());
                            completePayload.put("reason_code", validation.reasonCode());
                            completePayload.put("result", completeResult);
                            sendSse(emitter, completePayload);
                            emitter.complete();
                            return;
                        }

                        fullResponse = validation.normalizedPayload();
                        sendSse(emitter, Map.of(
                            "stage", "streaming",
                            "status", "running",
                            "message", "Đang stream patch local",
                            "chunk", fullResponse,
                            "responseMode", responseMode,
                            "contextType", contextType,
                            "model", "local_provider"
                        ));
                        sendSse(emitter, Map.of(
                            "stage", "streaming_progress",
                            "status", "running",
                            "message", validation.noOp()
                                ? "Patch local hợp lệ (no-op)"
                                : "Patch local đã sẵn sàng",
                            "percent", 96,
                            "charsReceived", fullResponse.length(),
                            "responseMode", responseMode,
                            "contextType", contextType
                        ));

                        long elapsedMs = Math.max(0L, System.currentTimeMillis() - executeStartedAt);
                        Map<String, Object> completeResult = new LinkedHashMap<>();
                        completeResult.put("appId", appId);
                        completeResult.put("applyDynamicIngestion", applyDynamicIngestion);
                        completeResult.put("ingestCount", scanResult.ingestCount());
                        completeResult.put("aggregateScopeMask", scanResult.aggregateScopeMask());
                        completeResult.put("scopeTags", AiMultimodalScannerService.scopeTagsFromMask(Math.max(0, scanResult.aggregateScopeMask())));
                        completeResult.put("planningHints", scanResult.planningHints());

                        Map<String, Object> completePayload = new LinkedHashMap<>();
                        completePayload.put("stage", "complete");
                        completePayload.put("status", "done");
                        completePayload.put("message", "Local execute plan hoàn tất với patch local");
                        completePayload.put("responseMode", responseMode);
                        completePayload.put("contextType", contextType);
                        completePayload.put("model", "local_provider");
                        completePayload.put("localProviderPrimaryUsed", true);
                        completePayload.put("flowConfirmedByLocal", true);
                        completePayload.put("elapsedMs", elapsedMs);
                        completePayload.put("fullResponse", fullResponse);
                        completePayload.put("outputChars", fullResponse.length());
                        completePayload.put("textEditsCount", validation.textEditsCount());
                        completePayload.put("streamChunkCount", 1);
                        completePayload.put("streamedChars", fullResponse.length());
                        completePayload.put("result", completeResult);
                        sendSse(emitter, completePayload);
                        emitter.complete();
                        return;
                    }

                    sendSse(emitter, Map.of(
                        "stage", "error",
                        "status", "error",
                        "reason_code", localResult.reasonCode(),
                        "message", localResult.message(),
                        "responseMode", responseMode,
                        "contextType", contextType
                    ));
                    emitter.complete();
                    return;
                }

                sendSse(emitter, Map.of(
                    "stage", "complete",
                    "status", "done",
                    "message", "Local execute plan hoàn tất (dry-run streaming)",
                    "responseMode", responseMode,
                    "result", Map.of(
                        "appId", appId,
                        "applyDynamicIngestion", applyDynamicIngestion,
                        "ingestCount", scanResult.ingestCount(),
                        "aggregateScopeMask", scanResult.aggregateScopeMask(),
                        "scopeTags", AiMultimodalScannerService.scopeTagsFromMask(Math.max(0, scanResult.aggregateScopeMask())),
                        "planningHints", scanResult.planningHints()
                    )
                ));

                emitter.complete();
            } catch (Exception ex) {
                try {
                    sendSse(emitter, Map.of(
                        "stage", "error",
                        "status", "error",
                        "reason_code", "local_execute_plan_failed",
                        "message", ex.getMessage() == null ? "local_execute_plan_failed" : ex.getMessage()
                    ));
                } catch (Exception ignored) {
                    // Ignore nested streaming failures.
                }
                emitter.complete();
            }
        }, "ai-local-execute-plan");
        worker.setDaemon(true);
        worker.start();

        return emitter;
    }

    private boolean shouldUseLocalComfyUI(List<Map<String, Object>> attachments, String message) {
        if (comfyUIProcessService == null || !comfyUIProcessService.isConfigured()) {
            return false;
        }
        if (attachments != null) {
            for (Map<String, Object> attachment : attachments) {
                String type = String.valueOf(attachment.get("type") == null ? "" : attachment.get("type")).trim().toLowerCase(Locale.ROOT);
                String mimeType = String.valueOf(attachment.get("mimeType") == null ? "" : attachment.get("mimeType")).trim().toLowerCase(Locale.ROOT);
                if ("image".equals(type) || mimeType.startsWith("image/")) {
                    return true;
                }
            }
        }
        String normalizedMessage = String.valueOf(message == null ? "" : message).trim().toLowerCase(Locale.ROOT);
        return normalizedMessage.contains("video")
            || normalizedMessage.contains("comfyui")
            || normalizedMessage.contains("ltx")
            || normalizedMessage.contains("image");
    }

    private Map<String, Object> modelCandidate(
        String file,
        String role,
        String profile,
        String estimatedRam,
        boolean weakMachineRecommended,
        boolean configured,
        String quantization
    ) {
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("file", file);
        model.put("role", role);
        model.put("profile", profile);
        model.put("estimatedRam", estimatedRam);
        model.put("weakMachineRecommended", weakMachineRecommended);
        model.put("configured", configured);
        model.put("quantization", quantization);
        model.put("weakMachineScore", scoreWeakMachine(role, quantization, profile));
        return model;
    }

    private List<Map<String, Object>> discoverLocalModelFiles() {
        List<Path> files = new ArrayList<>();
        Set<String> seenAbsolute = new LinkedHashSet<>();
        for (Path modelDir : resolveModelDirectories()) {
            if (!Files.isDirectory(modelDir)) {
                continue;
            }
            try (Stream<Path> stream = Files.list(modelDir)) {
                stream
                    .filter(path -> Files.isRegularFile(path) && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".gguf"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString().toLowerCase(Locale.ROOT)))
                    .forEach(path -> {
                        String key = path.toAbsolutePath().normalize().toString();
                        if (seenAbsolute.add(key)) {
                            files.add(path);
                        }
                    });
            } catch (Exception ignored) {
                // Continue scanning other candidate directories.
            }
        }

        String configuredFile = configuredModelFileName();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Path file : files) {
            String name = file.getFileName().toString();
            String lower = name.toLowerCase(Locale.ROOT);
            String role = detectRole(lower);
            String quant = detectQuantization(lower);
            String profile = detectProfile(role, lower, quant);
            String estimatedRam = estimateRam(role, lower, quant);
            boolean weakMachineRecommended = scoreWeakMachine(role, quant, profile) >= 70;
            boolean configured = !configuredFile.isBlank() && configuredFile.equalsIgnoreCase(name);
            Map<String, Object> model = modelCandidate(
                name,
                role,
                profile,
                estimatedRam,
                weakMachineRecommended,
                configured,
                quant
            );
            model.put("path", file.toString());
            out.add(model);
        }
        return out;
    }

    private Path resolvePrimaryModelDirectory() {
        String normalized = String.valueOf(localModelPath == null ? "" : localModelPath).trim();
        if (normalized.isBlank()) {
            return Paths.get("./csm_datas/ai_local/model").normalize();
        }
        Path configuredPath = Paths.get(normalized).normalize();
        Path parent = configuredPath.getParent();
        return parent == null ? Paths.get(".").toAbsolutePath().normalize() : parent;
    }

    private List<Path> resolveModelDirectories() {
        LinkedHashSet<Path> dirs = new LinkedHashSet<>();
        Path primary = resolvePrimaryModelDirectory();
        dirs.add(primary);

        Path cwd = Paths.get(".").toAbsolutePath().normalize();
        dirs.add(cwd.resolve("csm_datas/ai_local/model").normalize());
        dirs.add(cwd.resolve("backend/csm_datas/ai_local/model").normalize());

        return new ArrayList<>(dirs);
    }

    private List<Map<String, Object>> recommendByRamBudget(List<Map<String, Object>> candidates, double budgetGb, int limit) {
        if (candidates == null || candidates.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> item : candidates) {
            double upper = parseEstimatedRamUpperGb(str(item.get("estimatedRam")));
            boolean within = upper <= 0 || upper <= budgetGb;
            if (!within) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>(item);
            row.put("estimatedRamUpperGb", upper > 0 ? upper : null);
            row.put("fitsBudget", true);
            filtered.add(row);
        }

        filtered.sort((a, b) -> Integer.compare(
            toInt(b.get("weakMachineScore"), 0),
            toInt(a.get("weakMachineScore"), 0)
        ));

        int safeLimit = Math.max(1, limit);
        if (filtered.size() <= safeLimit) {
            return filtered;
        }
        return filtered.subList(0, safeLimit);
    }

    private double parseEstimatedRamUpperGb(String raw) {
        String text = String.valueOf(raw == null ? "" : raw).trim().toLowerCase(Locale.ROOT);
        if (text.isBlank()) {
            return 0;
        }
        text = text.replace("~", "").replace("gb", "").trim();
        String[] range = text.split("-");
        try {
            if (range.length >= 2) {
                return Double.parseDouble(range[1].trim());
            }
            return Double.parseDouble(range[0].trim());
        } catch (Exception ignored) {
            return 0;
        }
    }

    private boolean modelFileExists(String modelPath) {
        String normalized = String.valueOf(modelPath == null ? "" : modelPath).trim();
        if (normalized.isBlank()) {
            return false;
        }
        try {
            return Files.isRegularFile(Paths.get(normalized).normalize());
        } catch (Exception ignored) {
            return false;
        }
    }

    private String configuredModelFileName() {
        String normalized = String.valueOf(localModelPath == null ? "" : localModelPath).trim();
        if (normalized.isBlank()) {
            return "";
        }
        try {
            Path path = Paths.get(normalized).normalize();
            Path name = path.getFileName();
            return name == null ? "" : name.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private String detectRole(String lowerFileName) {
        if (lowerFileName.contains("moondream") || lowerFileName.contains("smolvlm")
            || lowerFileName.contains("-vl-") || lowerFileName.contains("vision")) {
            return "vision";
        }
        return "reasoning";
    }

    private String detectQuantization(String value) {
        String lower = String.valueOf(value == null ? "" : value).toLowerCase(Locale.ROOT);
        if (lower.contains("q2_k")) return "q2_k";
        if (lower.contains("q3_k")) return "q3_k";
        if (lower.contains("q4_k_m")) return "q4_k_m";
        if (lower.contains("q4_k_s")) return "q4_k_s";
        if (lower.contains("q4_0")) return "q4_0";
        if (lower.contains("q5_k_m")) return "q5_k_m";
        if (lower.contains("q5_0")) return "q5_0";
        if (lower.contains("q6_k")) return "q6_k";
        if (lower.contains("q8_0")) return "q8_0";
        return "unknown";
    }

    private String detectProfile(String role, String lowerFileName, String quantization) {
        if ("vision".equals(role) && lowerFileName.contains("moondream")) {
            return "very-light";
        }
        if ("q2_k".equals(quantization)) {
            return "ultra-low-ram";
        }
        if (lowerFileName.contains("0.5b")) {
            return "very-light";
        }
        if (lowerFileName.contains("1.5b")) {
            return "balanced";
        }
        if (lowerFileName.contains("2b") || lowerFileName.contains("3b")) {
            return "higher-quality";
        }
        return "balanced";
    }

    private String estimateRam(String role, String lowerFileName, String quantization) {
        if ("vision".equals(role) && lowerFileName.contains("moondream")) {
            return "~0.5-0.9GB";
        }
        if ("vision".equals(role) && lowerFileName.contains("2b")) {
            return "~1.8-2.8GB";
        }
        if (lowerFileName.contains("0.5b")) {
            return "~0.4-0.7GB";
        }
        if (lowerFileName.contains("1.5b") && "q2_k".equals(quantization)) {
            return "~0.7-1.2GB";
        }
        if (lowerFileName.contains("1.5b")) {
            return "~1.0-1.6GB";
        }
        if (lowerFileName.contains("2b")) {
            return "~1.6-2.6GB";
        }
        return "~1.0-2.5GB";
    }

    private int scoreWeakMachine(String role, String quantization, String profile) {
        int score = 40;
        if ("q4_k_m".equals(quantization)) score += 35;
        else if ("q2_k".equals(quantization)) score += 25;
        else if ("q4_0".equals(quantization) || "q4_k_s".equals(quantization)) score += 18;
        else if ("q5_k_m".equals(quantization) || "q5_0".equals(quantization)) score += 8;
        else if ("q8_0".equals(quantization)) score -= 12;

        if ("very-light".equals(profile)) score += 15;
        else if ("ultra-low-ram".equals(profile)) score += 12;
        else if ("higher-quality".equals(profile)) score -= 10;

        if ("vision".equals(role)) {
            score -= 5;
        }
        if (score < 0) return 0;
        return Math.min(100, score);
    }

    private int toInt(Object raw, int fallback) {
        if (raw instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(raw));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private boolean parseBoolean(Object raw, boolean fallback) {
        if (raw instanceof Boolean bool) {
            return bool;
        }
        String value = str(raw).toLowerCase(Locale.ROOT);
        if (value.isBlank()) {
            return fallback;
        }
        return "true".equals(value) || "1".equals(value) || "yes".equals(value) || "y".equals(value);
    }

    private int parseIntSafe(Object raw, int fallback) {
        if (raw instanceof Number number) {
            return number.intValue();
        }
        try {
            String value = str(raw);
            if (value.isBlank()) return fallback;
            return Integer.parseInt(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private LocalExecutionResult runLocalPatchGeneration(String prompt) {
        if (llamaCppNativeService == null) {
            return new LocalExecutionResult(false, "", "local_provider_unavailable", "Local llama provider unavailable");
        }
        if (!llamaCppNativeService.isHealthy()) {
            return new LocalExecutionResult(false, "", "local_provider_unhealthy", "Local llama provider is not healthy");
        }
        try {
            String raw = llamaCppNativeService.generateContentFast(prompt, 512);
            JsonNode root = objectMapper.readTree(String.valueOf(raw == null ? "" : raw));
            if (!root.path("success").asBoolean(false)) {
                String code = String.valueOf(root.path("errorCode").asText("local_provider_failed"));
                String message = String.valueOf(root.path("message").asText("Local provider failed"));
                return new LocalExecutionResult(false, "", code, message);
            }
            String result = String.valueOf(root.path("result").asText(""));
            if (result.isBlank()) {
                return new LocalExecutionResult(false, "", "local_provider_empty_output", "Local provider returned empty output");
            }
            return new LocalExecutionResult(true, result.trim(), "", "");
        } catch (Exception ex) {
            return new LocalExecutionResult(false, "", "local_provider_exception", ex.getMessage() == null ? "local provider exception" : ex.getMessage());
        }
    }

    private String buildLocalPatchPrompt(String userMessage, String currentCode, String compactContext, List<String> planningHints) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("You are a local code patch generator.\n");
        prompt.append("Return ONLY valid JSON object with this exact schema:\n");
        prompt.append("{\"summary\":\"...\",\"changes\":[\"...\"],\"textEdits\":[{\"startLine\":1,\"endLine\":1,\"replacement\":\"...\",\"action\":\"add|edit|delete\"}]}\n");
        prompt.append("Rules:\n");
        prompt.append("- Use 1-based line numbers.\n");
        prompt.append("- Do not return markdown fences or explanations.\n");
        prompt.append("- Keep textEdits minimal and deterministic.\n");
        prompt.append("- If no change needed, return textEdits as empty array.\n\n");
        prompt.append("User request:\n").append(String.valueOf(userMessage == null ? "" : userMessage)).append("\n\n");
        if (planningHints != null && !planningHints.isEmpty()) {
            prompt.append("Planning hints:\n");
            for (int i = 0; i < planningHints.size(); i++) {
                String hint = String.valueOf(planningHints.get(i) == null ? "" : planningHints.get(i)).trim();
                if (!hint.isBlank()) {
                    prompt.append(i + 1).append(". ").append(hint).append("\n");
                }
            }
            prompt.append("\n");
        }
        if (compactContext != null && !compactContext.isBlank()) {
            prompt.append("Compact context:\n").append(compactContext).append("\n\n");
        }
        prompt.append("Current code:\n");
        prompt.append(currentCode);
        return prompt.toString();
    }

    private LocalPatchValidationResult validateLocalPatchPayload(String rawOutput, String currentCode) {
        String candidate = extractJsonCandidate(rawOutput);
        if (candidate.isBlank()) {
            return new LocalPatchValidationResult(false, "", "local_patch_not_json", "Local patch output is not valid JSON", 0, false);
        }
        try {
            JsonNode root = objectMapper.readTree(candidate);
            if (root == null || !root.isObject()) {
                return new LocalPatchValidationResult(false, "", "local_patch_invalid_schema", "Local patch JSON must be an object", 0, false);
            }

            JsonNode rawEdits = root.path("textEdits");
            if (!rawEdits.isArray()) {
                return new LocalPatchValidationResult(false, "", "local_patch_missing_textedits", "Local patch must contain textEdits array", 0, false);
            }
            if (rawEdits.size() > MAX_PATCH_TEXT_EDITS) {
                return new LocalPatchValidationResult(false, "", "local_patch_too_many_edits", "Local patch exceeds textEdits limit", rawEdits.size(), false);
            }

            int codeLines = Math.max(1, String.valueOf(currentCode == null ? "" : currentCode).split("\\n", -1).length);
            int totalReplacementChars = 0;

            ObjectNode normalized = objectMapper.createObjectNode();
            normalized.put("summary", String.valueOf(root.path("summary").asText("")));

            ArrayNode changes = objectMapper.createArrayNode();
            JsonNode rawChanges = root.path("changes");
            if (rawChanges.isArray()) {
                for (JsonNode item : rawChanges) {
                    String value = String.valueOf(item == null ? "" : item.asText(""));
                    if (!value.isBlank()) {
                        changes.add(value);
                    }
                }
            }
            normalized.set("changes", changes);

            ArrayNode normalizedEdits = objectMapper.createArrayNode();
            for (JsonNode edit : rawEdits) {
                if (edit == null || !edit.isObject()) {
                    return new LocalPatchValidationResult(false, "", "local_patch_invalid_edit", "Each textEdit must be an object", 0, false);
                }

                int startLine = edit.path("startLine").asInt(-1);
                int endLine = edit.path("endLine").asInt(-1);
                if (startLine < 1 || endLine < 1 || endLine < startLine) {
                    return new LocalPatchValidationResult(false, "", "local_patch_invalid_line_range", "textEdits contain invalid line range", 0, false);
                }

                int maxAllowedLine = codeLines + 1;
                if (startLine > maxAllowedLine || endLine > maxAllowedLine) {
                    return new LocalPatchValidationResult(false, "", "local_patch_line_out_of_bounds", "textEdits line range exceeds current code bounds", 0, false);
                }

                String replacement = String.valueOf(edit.path("replacement").asText(""));
                totalReplacementChars += replacement.length();
                if (totalReplacementChars > MAX_PATCH_REPLACEMENT_CHARS) {
                    return new LocalPatchValidationResult(false, "", "local_patch_replacement_too_large", "textEdits replacement exceeds safe size", 0, false);
                }

                String actionRaw = String.valueOf(edit.path("action").asText("edit")).trim().toLowerCase(Locale.ROOT);
                String action = switch (actionRaw) {
                    case "add", "edit", "delete" -> actionRaw;
                    default -> "edit";
                };

                ObjectNode normalizedEdit = objectMapper.createObjectNode();
                normalizedEdit.put("startLine", startLine);
                normalizedEdit.put("endLine", endLine);
                normalizedEdit.put("replacement", replacement);
                normalizedEdit.put("action", action);
                normalizedEdits.add(normalizedEdit);
            }

            normalized.set("textEdits", normalizedEdits);
            String normalizedPayload = objectMapper.writeValueAsString(normalized);
            boolean noOp = normalizedEdits.isEmpty();
            return new LocalPatchValidationResult(true, normalizedPayload, "", "", normalizedEdits.size(), noOp);
        } catch (Exception ex) {
            return new LocalPatchValidationResult(false, "", "local_patch_parse_failed", "Failed to parse local patch payload", 0, false);
        }
    }

    private String extractJsonCandidate(String rawOutput) {
        String text = String.valueOf(rawOutput == null ? "" : rawOutput).trim();
        if (text.isBlank()) {
            return "";
        }
        if (text.startsWith("{") && text.endsWith("}")) {
            return text;
        }
        if (text.startsWith("```") && text.endsWith("```")) {
            int firstBrace = text.indexOf('{');
            int lastBrace = text.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                return text.substring(firstBrace, lastBrace + 1).trim();
            }
        }
        int firstBrace = text.indexOf('{');
        int lastBrace = text.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return text.substring(firstBrace, lastBrace + 1).trim();
        }
        return "";
    }

    private String buildSafeNoOpPayload(String reasonCode, String reasonMessage) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("summary", "No-op fallback: local patch did not pass quality gate");
        ArrayNode changes = objectMapper.createArrayNode();
        String code = String.valueOf(reasonCode == null ? "local_patch_quality_gate" : reasonCode).trim();
        String message = String.valueOf(reasonMessage == null ? "quality gate rejected local patch" : reasonMessage).trim();
        if (!code.isBlank()) {
            changes.add("quality_gate_reason_code=" + code);
        }
        if (!message.isBlank()) {
            changes.add("quality_gate_message=" + message);
        }
        payload.set("changes", changes);
        payload.set("textEdits", objectMapper.createArrayNode());
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ignored) {
            return "{\"summary\":\"No-op fallback\",\"changes\":[],\"textEdits\":[]}";
        }
    }

    private record LocalExecutionResult(boolean success, String output, String reasonCode, String message) {}
    private record LocalPatchValidationResult(boolean success, String normalizedPayload, String reasonCode, String message, int textEditsCount, boolean noOp) {}

    private Map<String, Object> planStep(String id, String stage, String description, String status) {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("id", id);
        step.put("stage", stage);
        step.put("description", description);
        step.put("status", status);
        return step;
    }

    private String normalizeOrDefault(Object raw, String fallback) {
        String value = str(raw).toLowerCase(Locale.ROOT);
        return value.isBlank() ? fallback : value;
    }

    private List<Map<String, Object>> normalizeAttachments(Object raw) {
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> normalized = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    if (entry.getKey() == null) {
                        continue;
                    }
                    normalized.put(String.valueOf(entry.getKey()), entry.getValue());
                }
                if (!normalized.isEmpty()) {
                    out.add(normalized);
                }
            }
        }
        return out;
    }

    private int emitSyntheticLocalStreamChunks(
            SseEmitter emitter,
            String requestId,
            String text,
            int attempt,
            boolean localPreAnalysis,
            boolean localProviderPrimary) throws IOException {
        String safe = String.valueOf(text == null ? "" : text);
        if (safe.isBlank()) {
            return 0;
        }

        int chunkSize = 280;
        int chunks = 0;
        for (int i = 0; i < safe.length(); i += chunkSize) {
            String part = safe.substring(i, Math.min(safe.length(), i + chunkSize));
            Map<String, Object> chunkPayload = new LinkedHashMap<>();
            chunkPayload.put("stage", "streaming");
            chunkPayload.put("requestId", requestId);
            chunkPayload.put("chunk", part);
            chunkPayload.put("attempt", Math.max(1, attempt));
            chunkPayload.put("providerFallback", false);
            chunkPayload.put("localProviderPrimary", localProviderPrimary);
            chunkPayload.put("localPreAnalysis", localPreAnalysis);
            sendSse(emitter, chunkPayload);
            chunks += 1;
        }
        return chunks;
    }

    private String str(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }

    private void sendSse(SseEmitter emitter, Map<String, Object> payload) throws IOException {
        emitter.send(SseEmitter.event().name("message").data(payload));
    }
}
