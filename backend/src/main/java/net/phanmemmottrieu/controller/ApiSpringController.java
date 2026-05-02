package net.phanmemmottrieu.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

// THAY ĐỔI DÒNG NÀY:
// import javax.servlet.http.HttpServletRequest; // BỎ DÒNG NÀY

// THÊM DÒNG NÀY ĐỂ SỬ DỤNG PHIÊN BẢN JAKARTA CỦA HttpServletRequest:
import jakarta.servlet.http.HttpServletRequest;
import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.handler.AuthHandler;
import net.phanmemmottrieu.handler.HomeHandler;
import net.phanmemmottrieu.handler.InitHandler;
import net.phanmemmottrieu.handler.MenuHandler;
import net.phanmemmottrieu.handler.RoleHandler;
import net.phanmemmottrieu.handler.SeoHandler;
import net.phanmemmottrieu.handler.TableHandler;
import net.phanmemmottrieu.handler.CRMHandler;
import net.phanmemmottrieu.model.StandardResponse;
import net.phanmemmottrieu.service.AIProviderFactory;
import net.phanmemmottrieu.service.WebScraperService;
import net.phanmemmottrieu.service.GoogleIndexService;
import net.phanmemmottrieu.service.GoogleIndexQueueService;
import net.phanmemmottrieu.service.ChatPersistenceService;
import net.phanmemmottrieu.service.AiAssistantGatewayService;
import net.phanmemmottrieu.service.AiMenuMergeService;
import net.phanmemmottrieu.service.AiAssistantMemoryManagerService;
import net.phanmemmottrieu.service.GeminiStreamingService;
import net.phanmemmottrieu.service.LocalTranslationService;
import net.phanmemmottrieu.service.ApiCallInstrumentationService;
import net.phanmemmottrieu.service.AiConversationContextService;
import net.phanmemmottrieu.service.MenuQualityGateService;
import net.phanmemmottrieu.service.TokenOptimizationService;
import net.phanmemmottrieu.service.AiLocalOrchestrationService;
import com.corundumstudio.socketio.SocketIOServer;
import net.phanmemmottrieu.model.UrlSubmissionQueue;
import net.phanmemmottrieu.model.UrlSubmissionHistory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class ApiSpringController {

    private static final Logger logger = LoggerFactory.getLogger(ApiSpringController.class);
    private static final int AI_ASSISTANT_CURRENT_CODE_MAX_CHARS = 45000;
    private static final int AI_ASSISTANT_CURRENT_CODE_HEAD_CHARS = 12000;
    private static final int AI_ASSISTANT_CURRENT_CODE_TAIL_CHARS = 12000;
    private static final int AI_ASSISTANT_CURRENT_CODE_FOCUS_WINDOW_CHARS = 24000;
    private static final int AI_ASSISTANT_CURRENT_CODE_CONTEXT_HARD_CAP_CHARS = 60000;
    private static final int AI_ASSISTANT_MENU_CODE_MAX_CHARS = 220000;
    private static final int AI_ASSISTANT_MENU_CODE_HEAD_CHARS = 70000;
    private static final int AI_ASSISTANT_MENU_CODE_TAIL_CHARS = 70000;
    private static final int AI_ASSISTANT_MENU_CODE_FOCUS_WINDOW_CHARS = 90000;
    private static final int AI_ASSISTANT_MENU_CODE_CONTEXT_HARD_CAP_CHARS = 240000;
    private static final int AI_ASSISTANT_ATTACHMENT_TEXT_MAX_CHARS = 800000;
    private static final int AI_ASSISTANT_CONTINUITY_MEMORY_MAX_CHARS = 120000;
    private static final int AI_ASSISTANT_DEBUG_MARKDOWN_MAX_CHARS = 24000;
    private static final int AI_ASSISTANT_DEBUG_MESSAGES_JSON_MAX_CHARS = 18000;
    private static final int AI_ASSISTANT_DEBUG_RETRIEVAL_PREVIEW_MAX_CHARS = 6000;
    private static final int AI_ASSISTANT_CODE_GLOBAL_MAP_MAX_CHARS = 18000;
    private static final int AI_ASSISTANT_CODE_GLOBAL_SYMBOL_MAX_ITEMS = 60;
    private static final int AI_ASSISTANT_CODE_ANCHOR_MAX_ITEMS = 24;
    private static final int AI_ASSISTANT_CODE_ANCHOR_CHARS_PER_BLOCK = 24000;
    private static final int AI_ASSISTANT_CODE_FOCUS_EXCERPT_MAX_ITEMS = 3;
    private static final int AI_ASSISTANT_CODE_DISTRIBUTED_EXCERPT_MAX_ITEMS = 8;
    private static final int AI_ASSISTANT_CODE_DISTRIBUTED_EXCERPT_CHARS = 1600;
    private static final int AI_ASSISTANT_MENU_ATTACHMENT_CONTEXT_MAX_CHARS = 180000;
    private static final int AI_ASSISTANT_CODE_ATTACHMENT_CONTEXT_MAX_CHARS = 120000;
    private final ObjectMapper objectMapper = new ObjectMapper(); // Dùng để parse JSON body
    private final RecordManager recordManager;
    private final InitHandler initHandler;
    private final AuthHandler authHandler;
    private final RoleHandler roleHandler;
    private final MenuHandler menuHandler;
    private final HomeHandler homeHandler;
    private final TableHandler tableHandler;
    // private final AIHandler aiHandler;
    private final WebScraperService webScraperService;
    private final AIProviderFactory aiProviderFactory;
    private final GoogleIndexService googleIndexService;
    private final GoogleIndexQueueService googleIndexQueueService;
    private final ChatPersistenceService chatPersistenceService;
    private final AiAssistantGatewayService aiAssistantGatewayService;
    private final SocketIOServer socketIOServer;
    private final CRMHandler crmHandler;
    private final AiMenuMergeService aiMenuMergeService;
    private final AiAssistantMemoryManagerService aiAssistantMemoryManagerService;
    private final GeminiStreamingService geminiStreamingService;
    private final LocalTranslationService localTranslationService;
    private final ApiCallInstrumentationService apiCallInstrumentationService;
    private final AiConversationContextService aiConversationContextService;
    private final MenuQualityGateService menuQualityGateService;
    private final TokenOptimizationService tokenOptimizationService;
    private final AiLocalOrchestrationService aiLocalOrchestrationService;

    private static final int MAX_CODE_CHARS = 500_000;
    private static final int MAX_MESSAGE_CHARS = 20_000;

    @Value("${ai.prompt.max-chars:3000000}")
    private int maxPromptChars;

    @Value("${ai.prompt.gemini-max-chars:500000}")
    private int geminiMaxPromptChars;

    @Value("${ai.routing.stability.prefer-gemini-for-coding:true}")
    private boolean preferAiAssistantForCoding;

    @Value("${ai.routing.stability.force-gemini-for-coding:true}")
    private boolean forceAiAssistantForCoding;

    @Value("${ai.routing.stability.disable-fallback-for-gemini-coding:${ai.routing.stability.disable-fallback-for-coding:true}}")
    private boolean disableFallbackForCoding;

    @Value("${ai.async.job-ttl-ms:3600000}")
    private long aiAsyncJobTtlMs;

    @Value("${ai.async.poll-min-ms:3000}")
    private long aiAsyncPollMinMs;

    @Value("${ai.assistant.attachment-retrieval.enabled:true}")
    private boolean aiAssistantAttachmentRetrievalEnabled;

    @Value("${ai.assistant.attachment-retrieval.max-attachments:6}")
    private int aiAssistantAttachmentRetrievalMaxAttachments;

    @Value("${ai.assistant.attachment-retrieval.max-snippets-per-file:3}")
    private int aiAssistantAttachmentRetrievalMaxSnippetsPerFile;

    @Value("${ai.assistant.attachment-retrieval.snippet-window-chars:2200}")
    private int aiAssistantAttachmentRetrievalSnippetWindowChars;

    @Value("${ai.assistant.attachment-retrieval.max-total-chars:36000}")
    private int aiAssistantAttachmentRetrievalMaxTotalChars;

    @Value("${ai.assistant.ask-before-edit.enabled:true}")
    private boolean aiAssistantAskBeforeEditEnabled;

    @Value("${ai.assistant.edit-structured.required:true}")
    private boolean aiAssistantStructuredEditRequired;

    @Value("${ai.assistant.edit-structured.max-text-edits:120}")
    private int aiAssistantStructuredEditMaxTextEdits;

    @Value("${ai.assistant.edit-structured.require-checklist:true}")
    private boolean aiAssistantStructuredEditRequireChecklist;

    @Value("${ai.assistant.edit-structured.max-replacement-chars:800000}")
    private int aiAssistantStructuredEditMaxReplacementChars;

    @Value("${ai.assistant.menu.direct-provider-fallback-enabled:true}")
    private boolean aiAssistantMenuDirectProviderFallbackEnabled;

    @Value("${ai.assistant.menu.direct-provider-threshold-chars:160000}")
    private int aiAssistantMenuDirectProviderThresholdChars;

    @Value("${ai.assistant.menu.primary-probe-enabled:true}")
    private boolean aiAssistantMenuPrimaryProbeEnabled;

    @Value("${ai.assistant.menu.primary-probe-threshold-chars:100000}")
    private int aiAssistantMenuPrimaryProbeThresholdChars;

    @Value("${ai.assistant.menu.primary-probe-max-prompt-chars:18000}")
    private int aiAssistantMenuPrimaryProbeMaxPromptChars;

    @Value("${ai.assistant.menu.direct-provider-primary-probe-first:true}")
    private boolean aiAssistantMenuDirectProviderPrimaryProbeFirst;

    @Value("${ai.assistant.menu.primary-probe-timeout-ms:12000}")
    private long aiAssistantMenuPrimaryProbeTimeoutMs;

    @Value("${ai.assistant.menu.disable-gemini-fallback:true}")
    private boolean aiAssistantMenuDisableGeminiFallback;

    @Value("${ai.assistant.memory-manager.enabled:true}")
    private boolean aiAssistantMemoryManagerEnabled;

    @Value("${ai.assistant.menu.distill-large-json:true}")
    private boolean aiAssistantMenuDistillLargeJson;

    @Value("${ai.assistant.menu.distill-threshold-chars:40000}")
    private int aiAssistantMenuDistillThresholdChars;

    @Value("${ai.assistant.menu.chaining-enabled:true}")
    private boolean aiAssistantMenuChainingEnabled;

    @Value("${ai.assistant.menu.chaining-threshold-chars:250000}")
    private int aiAssistantMenuChainingThresholdChars;

    @Value("${ai.assistant.code.large-context-enabled:true}")
    private boolean aiAssistantCodeLargeContextEnabled;

    @Value("${ai.assistant.code.large-threshold-chars:150000}")
    private int aiAssistantCodeLargeThresholdChars;

    @Value("${ai.assistant.code.chaining-enabled:true}")
    private boolean aiAssistantCodeChainingEnabled;

    @Value("${ai.assistant.code.chaining-threshold-chars:220000}")
    private int aiAssistantCodeChainingThresholdChars;

    @Value("${ai.assistant.code.chaining-cache.enabled:true}")
    private boolean aiAssistantCodeChainingCacheEnabled;

    @Value("${ai.assistant.code.chaining-cache.max-entries:240}")
    private int aiAssistantCodeChainingCacheMaxEntries;

    @Value("${ai.assistant.code.chaining-cache-ttl-ms:1800000}")
    private long aiAssistantCodeChainingCacheTtlMs;

    @Value("${ai.assistant.custom-instructions.path:csm_datas/public/ai-assistant-instructions.md}")
    private String aiAssistantCustomInstructionsPath;

    @Value("${ai.code-stream.max-prompt-chars:140000}")
    private int aiCodeStreamMaxPromptChars;

    @Value("${ai.code-stream.max-current-code-chars:80000}")
    private int aiCodeStreamMaxCurrentCodeChars;

    @Value("${ai.code-stream.max-attachment-chars-per-file:20000}")
    private int aiCodeStreamMaxAttachmentCharsPerFile;

    @Value("${ai.code-stream.max-attachments-total-chars:60000}")
    private int aiCodeStreamMaxAttachmentsTotalChars;

    @Value("${ai.code-stream.base-cache.enabled:true}")
    private boolean aiCodeStreamBaseCacheEnabled;

    @Value("${ai.code-stream.base-cache.max-content-chars:2200000}")
    private int aiCodeStreamMaxBaseContentChars;

    @Value("${ai.code-stream.base-cache.max-entries:24}")
    private int aiCodeStreamMaxBaseCacheEntries;

    @Value("${ai.code-stream.base-cache.ttl-minutes:90}")
    private int aiCodeStreamBaseCacheTtlMinutes;

    @Value("${ai.code-stream.base-cache.auto-promote-chars:120000}")
    private int aiCodeStreamBaseCacheAutoPromoteChars;

    @Value("${ai.code-stream.auto-continue.enabled:true}")
    private boolean aiCodeStreamAutoContinueEnabled;

    @Value("${ai.code-stream.auto-continue.max-attempts:3}")
    private int aiCodeStreamAutoContinueMaxAttempts;

    @Value("${ai.code-stream.auto-continue.max-previous-response-chars:120000}")
    private int aiCodeStreamAutoContinueMaxPreviousResponseChars;

    @Value("${ai.code-stream.edit.text-edits-retry.enabled:true}")
    private boolean aiCodeStreamEditTextEditsRetryEnabled;

    @Value("${ai.code-stream.edit.text-edits-retry.max-prompt-chars:80000}")
    private int aiCodeStreamEditTextEditsRetryMaxPromptChars;

    @Value("${ai.code-stream.edit.text-edits-retry.max-extra-attempts:1}")
    private int aiCodeStreamEditTextEditsRetryMaxExtraAttempts;

    @Value("${ai.menu.auto-continue.enabled:true}")
    private boolean aiMenuAutoContinueEnabled;

    @Value("${ai.menu.auto-continue.max-attempts:2}")
    private int aiMenuAutoContinueMaxAttempts;

    @Value("${ai.menu.auto-continue.prompt-threshold-chars:90000}")
    private int aiMenuAutoContinuePromptThresholdChars;

    @Value("${ai.menu.auto-continue.max-previous-output-chars:120000}")
    private int aiMenuAutoContinueMaxPreviousOutputChars;

    @Value("${ai.code-stream.routing.enabled:true}")
    private boolean aiCodeStreamRoutingEnabled;

    @Value("${ai.code-stream.routing.simple-model:}")
    private String aiCodeStreamRoutingSimpleModel;

    @Value("${ai.code-stream.routing.complex-threshold-chars:20000}")
    private int aiCodeStreamRoutingComplexThresholdChars;

    @Value("${ai.code-stream.routing.prefer-simple-for-edit:true}")
    private boolean aiCodeStreamRoutingPreferSimpleForEdit;

    @Value("${ai.code-stream.routing.edit-simple-max-chars:120000}")
    private int aiCodeStreamRoutingEditSimpleMaxChars;

    @Value("${ai.code-stream.routing.force-simple-first:true}")
    private boolean aiCodeStreamRoutingForceSimpleFirst;

    @Value("${ai.code-stream.routing.simple-first-max-chars:60000}")
    private int aiCodeStreamRoutingSimpleFirstMaxChars;

    @Value("${ai.code-stream.routing.retry-default-max-prompt-chars:80000}")
    private int aiCodeStreamRoutingRetryDefaultMaxPromptChars;

    @Value("${ai.code-stream.prompt-cache.min-chars:8000}")
    private int aiCodeStreamPromptCacheMinChars;

    @Value("${ai.assistant.prompt-budget.menu.max-chars:140000}")
    private int aiAssistantPromptBudgetMenuMaxChars;

    @Value("${ai.assistant.prompt-budget.code.max-chars:90000}")
    private int aiAssistantPromptBudgetCodeMaxChars;

    @Value("${ai.assistant.prompt-budget.code-analyze.current-code-max-chars:22000}")
    private int aiAssistantPromptBudgetCodeAnalyzeCurrentCodeMaxChars;

    @Value("${ai.assistant.prompt-budget.continuity.max-chars:30000}")
    private int aiAssistantPromptBudgetContinuityMaxChars;

    @Value("${ai.assistant.prompt-budget.global.max-chars:60000}")
    private int aiAssistantPromptBudgetGlobalMaxChars;

    @Value("${ai.assistant.menu.primary-probe.skip-when-over-ratio:1.4}")
    private double aiAssistantMenuPrimaryProbeSkipWhenOverRatio;

    @Value("${ai.telemetry.dashboard.window-hours:24}")
    private int aiTelemetryDashboardWindowHours;

    @Value("${ai.telemetry.alert.fallback-rate-threshold:0.35}")
    private double aiTelemetryAlertFallbackRateThreshold;

    @Value("${ai.telemetry.alert.quick-probe-rate-threshold:0.30}")
    private double aiTelemetryAlertQuickProbeRateThreshold;

    @Value("${ai.telemetry.alert.min-samples:12}")
    private int aiTelemetryAlertMinSamples;

    @Value("${gemini.model:}")
    private String aiCodeStreamDefaultStreamingModel;

    @Value("${gemini.streaming.model:}")
    private String aiCodeStreamLegacyStreamingModel;

    @Value("${ai.code-stream.cost.enabled:true}")
    private boolean aiCodeStreamCostEnabled;

    @Value("${ai.code-stream.cost.pro.input-usd-per-1k:0.00125}")
    private double aiCodeStreamCostProInputUsdPer1k;

    @Value("${ai.code-stream.cost.pro.output-usd-per-1k:0.005}")
    private double aiCodeStreamCostProOutputUsdPer1k;

    @Value("${ai.code-stream.cost.flash.input-usd-per-1k:0.0003}")
    private double aiCodeStreamCostFlashInputUsdPer1k;

    @Value("${ai.code-stream.cost.flash.output-usd-per-1k:0.0012}")
    private double aiCodeStreamCostFlashOutputUsdPer1k;

    @Value("${ai.code-stream.cost.default.input-usd-per-1k:0.001}")
    private double aiCodeStreamCostDefaultInputUsdPer1k;

    @Value("${ai.code-stream.cost.default.output-usd-per-1k:0.003}")
    private double aiCodeStreamCostDefaultOutputUsdPer1k;

    private volatile String cachedAiAssistantCustomInstructions = null;

    private final ExecutorService aiAsyncExecutor = Executors.newFixedThreadPool(2);
    private final ExecutorService aiCodeStreamExecutor = Executors.newCachedThreadPool();
    private final ConcurrentHashMap<String, Map<String, Object>> aiAsyncJobs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CodeChainingCacheEntry> codeChainingStep1Cache = new ConcurrentHashMap<>();
    private final Map<String, AiCodeBaseContentEntry> aiCodeBaseContentCache = new ConcurrentHashMap<>();

    // Tiêm tất cả các Handler thông qua constructor
    @Autowired
    public ApiSpringController(
            RecordManager recordManager,
            InitHandler initHandler,
            AuthHandler authHandler,
            RoleHandler roleHandler,
            MenuHandler menuHandler,
            HomeHandler homeHandler,
            TableHandler tableHandler,
            WebScraperService webScraperService ,
            AIProviderFactory aiProviderFactory,
            GoogleIndexService googleIndexService,
            GoogleIndexQueueService googleIndexQueueService,
            ChatPersistenceService chatPersistenceService,
            AiAssistantGatewayService aiAssistantGatewayService,
            SocketIOServer socketIOServer,
            CRMHandler crmHandler,
            AiMenuMergeService aiMenuMergeService,
            AiAssistantMemoryManagerService aiAssistantMemoryManagerService,
            GeminiStreamingService geminiStreamingService,
            LocalTranslationService localTranslationService,
            ApiCallInstrumentationService apiCallInstrumentationService,
            AiConversationContextService aiConversationContextService,
            MenuQualityGateService menuQualityGateService,
            TokenOptimizationService tokenOptimizationService,
            AiLocalOrchestrationService aiLocalOrchestrationService
        ) {
        this.recordManager = recordManager;
        this.initHandler = initHandler;
        this.authHandler = authHandler;
        this.roleHandler = roleHandler;
        this.menuHandler = menuHandler;
        this.homeHandler = homeHandler;
        this.tableHandler = tableHandler;
        // this.aiHandler = aiHandler; 
        this.webScraperService = webScraperService;
        this.aiProviderFactory = aiProviderFactory;
        this.googleIndexService = googleIndexService;
        this.googleIndexQueueService = googleIndexQueueService;
        this.chatPersistenceService = chatPersistenceService;
        this.aiAssistantGatewayService = aiAssistantGatewayService;
        this.socketIOServer = socketIOServer;
        this.crmHandler = crmHandler;
        this.aiMenuMergeService = aiMenuMergeService;
        this.aiAssistantMemoryManagerService = aiAssistantMemoryManagerService;
        this.geminiStreamingService = geminiStreamingService;
        this.localTranslationService = localTranslationService;
        this.apiCallInstrumentationService = apiCallInstrumentationService;
        this.aiConversationContextService = aiConversationContextService;
        this.menuQualityGateService = menuQualityGateService;
        this.tokenOptimizationService = tokenOptimizationService;
        this.aiLocalOrchestrationService = aiLocalOrchestrationService;
    }

    @PostMapping(value = {"/ai-code-stream", "/api/ai-code-stream"})
    public SseEmitter streamCodeAssistant(@RequestBody Map<String, Object> body) {
        SseEmitter emitter = new SseEmitter(900_000L); // 15-minute timeout

        emitter.onTimeout(() -> {
            logger.warn("ApiSpringController: ai-code-stream SSE timeout");
            emitter.complete();
        });
        emitter.onError(ex -> logger.debug("ApiSpringController: ai-code-stream SSE error: {}", ex.getMessage()));

        // Keep tenant scoping consistent with ApiSpringController security conventions.
        UserAuthContext authCtx = extractUserAuthContext();
        if (!authCtx.authenticated) {
            sendErrorEvent(emitter, "Authentication required");
            return emitter;
        }
        String requestedAppId = firstNonBlankString(body.get("appId"), body.get("app_id"));
        String userAppId = firstNonBlankString(authCtx.appId);
        if (!isCsmAdmin(authCtx)) {
            String effectiveAppId = firstNonBlankString(userAppId, requestedAppId, "csm");
            body.put("appId", effectiveAppId);
            body.put("app_id", effectiveAppId);
        }

        aiCodeStreamExecutor.execute(() -> {
            try {
                String requestId = Long.toHexString(System.currentTimeMillis()) + "-"
                        + Integer.toHexString(System.identityHashCode(Thread.currentThread()));
                String appId = str(body.get("appId"), "");
                String message = truncate(str(body.get("message"), ""), MAX_MESSAGE_CHARS);
                String currentCodeRaw = truncate(strKeep(body.get("currentCode"), ""), Math.max(MAX_CODE_CHARS, aiCodeStreamMaxBaseContentChars));
                String language = str(body.get("language"), "javascript");
                String contextType = str(body.get("contextType"), "code");
                String responseMode = str(body.get("responseMode"), "analyze");
                String modelOverride = str(body.get("model"), "");
                String pName = str(body.get("pName"), "");
                Integer pType = parseNullableInteger(body.get("pType"));
                int cursorLine = parseIntSafe(body.get("cursorLine"), -1);
                int contextWindowLines = parseIntSafe(body.get("contextWindowLines"), 50);
                String baseContentRef = str(body.get("baseContentRef"), "");
                String baseContent = truncate(strKeep(body.get("baseContent"), ""), Math.max(100000, aiCodeStreamMaxBaseContentChars));
                boolean preserveBaseContent = bool(body.get("preserveBaseContent"), false);
                Object attachmentsRaw = body.get("attachments");

                if (message.isBlank()) {
                    sendErrorEvent(emitter, "Message không được để trống");
                    return;
                }

                pruneBaseContentCache();
                AiCodeBaseContentResolution base = resolveBaseContent(appId, baseContentRef, baseContent, currentCodeRaw);
                String effectiveCodeContext = currentCodeRaw;
                if (preserveBaseContent && !base.baseContent().isBlank()) {
                    effectiveCodeContext = base.baseContent();
                } else if (effectiveCodeContext.isBlank() && !base.baseContent().isBlank()) {
                    effectiveCodeContext = base.baseContent();
                }
                effectiveCodeContext = truncate(effectiveCodeContext, Math.max(MAX_CODE_CHARS, aiCodeStreamMaxBaseContentChars));
                CodeWindowContext focusWindow = extractCodeWindowByLine(effectiveCodeContext, cursorLine, contextWindowLines);
                String promptCodeContext = focusWindow != null && !focusWindow.code().isBlank()
                    ? focusWindow.code()
                    : effectiveCodeContext;

                String reusableCodeMemory = trimAiAssistantContinuityMemory(
                    aiConversationContextService.buildAggregatedContextWindow(
                        authCtx.principalId,
                        appId,
                        contextType,
                        pName,
                        pType));
                String messageWithReuse = message;
                if (!reusableCodeMemory.isBlank()) {
                    String compactReuse = truncateMiddle(reusableCodeMemory, 12000);
                    messageWithReuse = "[REUSED_CONTEXT]\n" + compactReuse + "\n\n[CURRENT_REQUEST]\n" + message;
                }

                String prompt = buildCodingPrompt(messageWithReuse, promptCodeContext, language, contextType, responseMode, attachmentsRaw);
                boolean largeStructuredEditMode = preserveBaseContent
                        && "edit".equalsIgnoreCase(responseMode)
                        && !base.baseContent().isBlank()
                        && base.baseContentChars() > Math.max(100000, aiCodeStreamMaxCurrentCodeChars);
                if (largeStructuredEditMode) {
                    prompt = buildCodingPrompt(messageWithReuse, promptCodeContext, language, contextType, responseMode,
                            attachmentsRaw, true, base.baseRef(), base.baseContentChars());
                }
                if (prompt.length() > aiCodeStreamMaxPromptChars) {
                    prompt = truncateMiddle(prompt, Math.max(20000, aiCodeStreamMaxPromptChars));
                }

                int systemContentEstimate = prompt.length() - message.length();
                boolean usePromptCache = systemContentEstimate >= Math.max(1000, aiCodeStreamPromptCacheMinChars);
                String[] promptParts = usePromptCache
                    ? buildCodingPromptParts(message, promptCodeContext, language, contextType, responseMode,
                                attachmentsRaw, largeStructuredEditMode, base.baseRef(), base.baseContentChars())
                        : new String[] { prompt, "" };
                if (promptParts[0].length() > aiCodeStreamMaxPromptChars) {
                    promptParts[0] = truncateMiddle(promptParts[0], Math.max(20000, aiCodeStreamMaxPromptChars));
                    usePromptCache = false;
                }

                String effectiveModel = routeModel(message, effectiveCodeContext, contextType, responseMode, modelOverride);
                String defaultModel = resolveDefaultStreamingModel();
                String simpleModel = resolveSimpleStreamingModel();
                Map<String, Object> codeStreamMeta = new LinkedHashMap<>();
                boolean shouldFallbackToDefaultOnSimpleFailure = aiCodeStreamRoutingForceSimpleFirst
                    && effectiveModel.equalsIgnoreCase(simpleModel)
                    && !defaultModel.equalsIgnoreCase(simpleModel)
                    && prompt.length() <= Math.max(20000, aiCodeStreamRoutingRetryDefaultMaxPromptChars);
                boolean switchedToDefaultModel = false;
                boolean providerFallbackUsed = false;
                long startedAtMs = System.currentTimeMillis();

                List<Map<String, String>> imageParts = extractImageParts(attachmentsRaw);
                boolean hasImages = !imageParts.isEmpty();

                logger.info(
                    "ApiSpringController: ai-code-stream start requestId={} appId={} model={} language={} promptChars={} promptTokens~{} messageChars={} promptCache={} images={} focusLine={} focusStart={} focusEnd={} focusChars={}",
                    requestId, appId, effectiveModel, language, prompt.length(), estimateTokens(prompt), message.length(), usePromptCache,
                        imageParts.size(), cursorLine,
                        focusWindow == null ? -1 : focusWindow.startLine(),
                        focusWindow == null ? -1 : focusWindow.endLine(),
                        promptCodeContext.length());

                if (!base.baseRef().isBlank()) {
                    sendEvent(emitter, jsonOf(
                            "stage", "context",
                            "status", "base_cached",
                            "requestId", requestId,
                            "baseContentRef", base.baseRef(),
                            "baseContentChars", base.baseContentChars(),
                            "effectiveCodeChars", effectiveCodeContext.length(),
                            "preserveBaseContent", preserveBaseContent));
                }

                int promptTokens = estimateTokens(prompt);
                int estimatedWaitSecs = 3 + prompt.length() / 4000 + (8192 * 4 / 400);
                String routeReasonCode = effectiveModel.equalsIgnoreCase(defaultModel)
                    ? "routing_default_model"
                    : "routing_simple_model";
                sendEvent(emitter, jsonOf(
                        "stage", "preparing",
                    "requestId", requestId,
                        "message", "Đang kết nối Gemini...",
                        "model", effectiveModel,
                        "modelDecisionStep", "primary",
                    "modelDecisionReason", routeReasonCode,
                        "decision_step", "primary",
                    "reason_code", routeReasonCode,
                        "promptTokens", promptTokens,
                        "estimatedWaitSecs", estimatedWaitSecs,
                        "percent", 0));

                String rawResponse;
                if (hasImages) {
                    rawResponse = streamWithAutoContinueMultimodal(emitter, prompt, imageParts, effectiveModel, language,
                        responseMode, requestId);
                } else {
                    rawResponse = streamWithAutoContinue(
                            emitter,
                            prompt,
                            promptParts[0],
                            promptParts[1],
                            effectiveModel,
                            language,
                            contextType,
                            responseMode,
                            largeStructuredEditMode,
                            usePromptCache,
                            codeStreamMeta,
                            requestId);
                }
                if (rawResponse == null) {
                    if (!shouldFallbackToDefaultOnSimpleFailure || hasImages) {
                        sendErrorEvent(emitter, "Model streaming lỗi và không thể fallback tự động");
                        return;
                    }

                    sendEvent(emitter, jsonOf(
                            "stage", "model_switch",
                            "status", "fallback",
                            "requestId", requestId,
                            "model", defaultModel,
                            "modelDecisionStep", "fallback",
                            "modelDecisionReason", "provider_error",
                            "decision_step", "fallback",
                            "reason_code", "provider_error",
                            "message", "Simple model lỗi, tự động chuyển sang model mặc định"));

                    rawResponse = streamWithAutoContinue(
                            emitter,
                            prompt,
                            promptParts[0],
                            promptParts[1],
                            defaultModel,
                            language,
                            contextType,
                            responseMode,
                            largeStructuredEditMode,
                            usePromptCache,
                            codeStreamMeta,
                            requestId);
                    effectiveModel = defaultModel;
                            switchedToDefaultModel = true;

                    if (rawResponse == null) {
                        sendEvent(emitter, jsonOf(
                            "stage", "model_switch",
                            "status", "fallback_provider",
                            "requestId", requestId,
                            "model", "provider_fallback",
                            "modelDecisionStep", "fallback",
                            "modelDecisionReason", "provider_error",
                            "decision_step", "fallback",
                            "reason_code", "provider_error",
                            "message", "Simple/default stream đều thất bại, chuyển sang provider fallback"));

                        String providerRaw = aiProviderFactory.generateContent(prompt);
                        String providerText = extractAiResultText(providerRaw);
                        if ((providerText == null || providerText.isBlank()) && providerRaw != null) {
                            providerText = providerRaw.trim();
                        }
                        if (providerText == null || providerText.isBlank()) {
                            sendErrorEvent(emitter, "Cả simple model, default model và provider fallback đều thất bại");
                            return;
                        }

                        sendEvent(emitter, jsonOf(
                            "stage", "streaming",
                            "requestId", requestId,
                            "chunk", providerText,
                            "attempt", 1,
                            "providerFallback", true));
                        rawResponse = providerText;
                        effectiveModel = "provider_fallback";
                        providerFallbackUsed = true;
                    }
                }

                Map<String, Object> completion = new LinkedHashMap<>();
                completion.put("stage", "complete");
                String completionPayload = rawResponse;
                if (largeStructuredEditMode) {
                    completionPayload = materializeLargeEditResponse(completionPayload, base.baseContent());
                }
                if (!largeStructuredEditMode
                        && "edit".equalsIgnoreCase(responseMode)
                        && !isMenuJsonContext(contextType)) {
                    completionPayload = salvageSearchReplaceAsTextEdits(completionPayload, effectiveCodeContext);
                    completionPayload = salvagePropertyPatchAsTextEdits(completionPayload, effectiveCodeContext);
                }
                if ("edit".equalsIgnoreCase(responseMode) && isMenuJsonContext(contextType)) {
                    completionPayload = mergeMenuCompletionWithBase(effectiveCodeContext, completionPayload, contextType);
                }
                Map<String, Object> outputShape = analyzeCodeStreamOutputShape(responseMode, contextType, completionPayload,
                    largeStructuredEditMode);
                completion.put("fullResponse", completionPayload);
                completion.put("responseMode", responseMode);
                completion.putAll(outputShape);
                completion.put("textEditsRetryTriggered",
                    bool(codeStreamMeta.get("textEditsRetryTriggered"), false));
                completion.put("textEditsRetryAttempts",
                    parseIntSafe(codeStreamMeta.get("textEditsRetryAttempts"), 0));
                int completionTokens = estimateTokens(rawResponse);
                Map<String, Object> usageInfo = buildUsageInfoForSse(effectiveModel, promptTokens, completionTokens);
                completion.put("usage", usageInfo);
                completion.put("promptTokens", promptTokens);
                completion.put("completionTokens", completionTokens);
                completion.put("estimatedCostUsd", usageInfo.get("estimatedCostUsd"));
                completion.put("model", effectiveModel);
                completion.put("modelDecisionStep", "final");
                completion.put("modelDecisionReason", "completed");
                completion.put("decision_step", "final");
                completion.put("reason_code", "completed");
                completion.put("requestId", requestId);
                if (!base.baseRef().isBlank()) {
                    completion.put("baseContentRef", base.baseRef());
                    completion.put("baseContentChars", base.baseContentChars());
                }
                completion.put("timestamp", System.currentTimeMillis());
                sendEvent(emitter, objectMapper.writeValueAsString(completion));

                logger.info(
                    "AI_TELEMETRY flow=ai-code-stream requestId={} appId={} contextType={} responseMode={} model={} promptChars={} promptTokens={} outputChars={} completionTokens={} estimatedCostUsd={} outputShape={} textEditsCount={} fallbackToFullCode={} textEditsRetryTriggered={} textEditsRetryAttempts={} switchedToDefaultModel={} providerFallbackUsed={} promptCache={} images={} elapsedMs={}",
                    requestId,
                    appId,
                    contextType,
                    responseMode,
                    effectiveModel,
                    prompt.length(),
                    promptTokens,
                    rawResponse.length(),
                    completionTokens,
                    usageInfo.get("estimatedCostUsd"),
                    outputShape.get("outputShape"),
                    outputShape.get("textEditsCount"),
                    outputShape.get("fallbackToFullCode"),
                    bool(codeStreamMeta.get("textEditsRetryTriggered"), false),
                    parseIntSafe(codeStreamMeta.get("textEditsRetryAttempts"), 0),
                    switchedToDefaultModel,
                    providerFallbackUsed,
                    usePromptCache,
                    imageParts.size(),
                    (System.currentTimeMillis() - startedAtMs));

                Map<String, Object> codeTelemetry = new LinkedHashMap<>();
                codeTelemetry.put("timestamp", System.currentTimeMillis());
                codeTelemetry.put("flow", "ai-code-stream");
                codeTelemetry.put("appId", appId);
                codeTelemetry.put("contextType", contextType);
                codeTelemetry.put("taskType", "code_stream");
                codeTelemetry.put("responseMode", responseMode);
                codeTelemetry.put("model", effectiveModel);
                codeTelemetry.put("promptChars", prompt.length());
                codeTelemetry.put("promptTokens", promptTokens);
                codeTelemetry.put("outputChars", rawResponse.length());
                codeTelemetry.put("completionTokens", completionTokens);
                codeTelemetry.put("estimatedCostUsd", usageInfo.get("estimatedCostUsd"));
                codeTelemetry.put("outputShape", outputShape.get("outputShape"));
                codeTelemetry.put("textEditsCount", outputShape.get("textEditsCount"));
                codeTelemetry.put("fallbackToFullCode", outputShape.get("fallbackToFullCode"));
                codeTelemetry.put("textEditsRetryTriggered", bool(codeStreamMeta.get("textEditsRetryTriggered"), false));
                codeTelemetry.put("textEditsRetryAttempts", parseIntSafe(codeStreamMeta.get("textEditsRetryAttempts"), 0));
                codeTelemetry.put("switchedToDefaultModel", switchedToDefaultModel);
                codeTelemetry.put("providerFallbackUsed", providerFallbackUsed);
                codeTelemetry.put("attachments", imageParts.size());
                codeTelemetry.put("elapsedMs", Math.max(0L, (System.currentTimeMillis() - startedAtMs)));
                apiCallInstrumentationService.recordAiTelemetry(codeTelemetry);

                Map<String, Object> codeTurnMeta = new LinkedHashMap<>();
                codeTurnMeta.put("source", "aiCodeStream");
                codeTurnMeta.put("model", effectiveModel);
                codeTurnMeta.put("responseMode", responseMode);
                codeTurnMeta.put("promptTokens", promptTokens);
                codeTurnMeta.put("completionTokens", completionTokens);
                aiConversationContextService.recordTurnWithScopes(
                    authCtx.principalId,
                    appId,
                    contextType,
                    pName,
                    pType,
                    message,
                    rawResponse,
                    codeTurnMeta);

                logger.info("ApiSpringController: ai-code-stream complete requestId={} appId={} model={} elapsedMs={} outputChars={}",
                    requestId, appId, effectiveModel, (System.currentTimeMillis() - startedAtMs), rawResponse.length());
                emitter.complete();

            } catch (Exception ex) {
                logger.error("ApiSpringController: ai-code-stream unexpected error: {}", ex.getMessage(), ex);
                try {
                    sendErrorEvent(emitter, "Lỗi hệ thống: " + ex.getMessage());
                } catch (Exception ignored) {
                    emitter.completeWithError(ex);
                }
            }
        });

        return emitter;
    }

    @PostMapping(value = {"/ai/propose-edits", "/api/ai/propose-edits"})
    public ResponseEntity<Map<String, Object>> proposeEdits(@RequestBody Map<String, Object> body) {
        try {
            long startedAt = System.currentTimeMillis();
            UserAuthContext authCtx = extractUserAuthContext();
            if (!authCtx.authenticated) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("ok", false, "error", "Authentication required"));
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> target = body.get("target") instanceof Map<?, ?>
                    ? new LinkedHashMap<>((Map<String, Object>) body.get("target"))
                    : new LinkedHashMap<>();

            String kind = str(target.get("kind"), "");
            String currentContent = strKeep(body.get("currentContent"), "");
            List<Map<String, Object>> operations = toOperationList(body.get("operations"));

            String baseHash = str(body.get("baseHash"), "");
            if (baseHash.isBlank() && !currentContent.isBlank()) {
                baseHash = sha256Hex(currentContent);
            }

            if (operations.isEmpty()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> options = body.get("options") instanceof Map<?, ?>
                        ? (Map<String, Object>) body.get("options")
                        : Collections.emptyMap();
                String preferStyle = str(options.get("preferOperationStyle"), "");
                operations = buildNoopOperations(kind, preferStyle);
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("proposalId", UUID.randomUUID().toString());
            out.put("target", target);
            out.put("baseVersion", parseIntSafe(body.get("baseVersion"), 0));
            out.put("baseHash", baseHash);
            out.put("operationStyle", inferOperationStyle(kind, operations));
            out.put("operations", operations);
            out.put("summary", "Proposed editable operations for " + (kind.isBlank() ? "unknown" : kind));
            out.put("risk", Map.of(
                    "touchedPercentEstimate", estimateTouchedPercent(currentContent, operations),
                    "highRisk", false,
                    "reasons", Collections.emptyList()));
            out.put("meta", Map.of(
                    "model", "local_contract",
                    "fallbackUsed", false,
                    "tokenEstimate", Map.of("input", 0, "output", 0)));

                Map<String, Object> telemetry = new LinkedHashMap<>();
                telemetry.put("timestamp", System.currentTimeMillis());
                telemetry.put("flow", "ai-propose-edits");
                telemetry.put("appId", str(target.get("appId"), ""));
                telemetry.put("contextType", str(target.get("contextType"), ""));
                telemetry.put("taskType", str(target.get("kind"), "unknown"));
                telemetry.put("responseMode", "propose");
                telemetry.put("model", "local_contract");
                telemetry.put("promptChars", strKeep(body.get("userIntent"), "").length());
                telemetry.put("promptTokens", 0);
                telemetry.put("outputChars", objectMapper.writeValueAsString(operations).length());
                telemetry.put("completionTokens", 0);
                telemetry.put("estimatedCostUsd", 0);
                telemetry.put("elapsedMs", Math.max(0L, System.currentTimeMillis() - startedAt));
                apiCallInstrumentationService.recordAiTelemetry(telemetry);
            return ResponseEntity.ok(out);
        } catch (Exception ex) {
            logger.error("ApiSpringController: propose-edits error: {}", ex.getMessage(), ex);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("ok", false, "error", "propose-edits failed: " + ex.getMessage()));
        }
    }

    @PostMapping(value = {"/ai/apply-edits", "/api/ai/apply-edits"})
    public ResponseEntity<Map<String, Object>> applyEdits(@RequestBody Map<String, Object> body) {
        try {
            long startedAt = System.currentTimeMillis();
            UserAuthContext authCtx = extractUserAuthContext();
            if (!authCtx.authenticated) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("ok", false, "error", "Authentication required"));
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> target = body.get("target") instanceof Map<?, ?>
                    ? new LinkedHashMap<>((Map<String, Object>) body.get("target"))
                    : new LinkedHashMap<>();
            String kind = str(target.get("kind"), "");
            String applyMode = str(body.get("applyMode"), "dry_run");
            String currentContent = strKeep(body.get("currentContent"), "");
            List<Map<String, Object>> operations = toOperationList(body.get("operations"));

            if (operations.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("ok", false, "error", "operations is empty"));
            }

            ApplyEditsResult result;
            if ("menu_json".equalsIgnoreCase(kind)) {
                result = applyMenuJsonOperations(currentContent, operations);
            } else if ("code_doc".equalsIgnoreCase(kind)) {
                result = applyCodeDocOperations(currentContent, operations);
            } else {
                return ResponseEntity.badRequest()
                        .body(Map.of("ok", false, "error", "Unsupported target.kind: " + kind));
            }

            int nextVersion = parseIntSafe(body.get("baseVersion"), 0) + ("apply".equalsIgnoreCase(applyMode) ? 1 : 0);
            String nextHash = sha256Hex(result.resultContent);

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", result.conflicts.isEmpty());
            out.put("applyMode", applyMode);
            out.put("nextVersion", nextVersion);
            out.put("nextHash", nextHash);
            out.put("resultContent", result.resultContent);
            out.put("appliedOperations", result.appliedOperationIds);
            out.put("skippedOperations", result.skippedOperationIds);
            out.put("conflicts", result.conflicts);
            out.put("hunks", result.hunks);
            out.put("validation", Map.of(
                    "syntaxValid", true,
                    "schemaValid", true,
                    "warnings", Collections.emptyList()));

                Map<String, Object> telemetry = new LinkedHashMap<>();
                telemetry.put("timestamp", System.currentTimeMillis());
                telemetry.put("flow", "ai-apply-edits");
                telemetry.put("appId", str(target.get("appId"), ""));
                telemetry.put("contextType", str(target.get("contextType"), ""));
                telemetry.put("taskType", kind);
                telemetry.put("responseMode", "apply");
                telemetry.put("model", "local_contract");
                telemetry.put("promptChars", strKeep(currentContent, "").length());
                telemetry.put("promptTokens", 0);
                telemetry.put("outputChars", strKeep(result.resultContent, "").length());
                telemetry.put("completionTokens", 0);
                telemetry.put("estimatedCostUsd", 0);
                telemetry.put("attachments", operations.size());
                telemetry.put("elapsedMs", Math.max(0L, System.currentTimeMillis() - startedAt));
                apiCallInstrumentationService.recordAiTelemetry(telemetry);
            return ResponseEntity.ok(out);
        } catch (Exception ex) {
            logger.error("ApiSpringController: apply-edits error: {}", ex.getMessage(), ex);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("ok", false, "error", "apply-edits failed: " + ex.getMessage()));
        }
    }

    private static final class ApplyEditsResult {
        private String resultContent;
        private final List<String> appliedOperationIds = new ArrayList<>();
        private final List<String> skippedOperationIds = new ArrayList<>();
        private final List<Map<String, Object>> conflicts = new ArrayList<>();
        private final List<Map<String, Object>> hunks = new ArrayList<>();
    }

    private List<Map<String, Object>> toOperationList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) {
                @SuppressWarnings("unchecked")
                Map<String, Object> casted = new LinkedHashMap<>((Map<String, Object>) m);
                out.add(casted);
            }
        }
        return out;
    }

    private String inferOperationStyle(String kind, List<Map<String, Object>> operations) {
        if (operations.isEmpty()) {
            return "none";
        }
        String firstType = str(operations.get(0).get("type"), "");
        if ("menu_json".equalsIgnoreCase(kind)) {
            return firstType.isBlank() ? "id_patch" : firstType;
        }
        if ("code_doc".equalsIgnoreCase(kind)) {
            return firstType.isBlank() ? "search_replace" : firstType;
        }
        return firstType.isBlank() ? "mixed" : firstType;
    }

    private List<Map<String, Object>> buildNoopOperations(String kind, String preferStyle) {
        Map<String, Object> op = new LinkedHashMap<>();
        op.put("id", "op_noop_1");
        if ("menu_json".equalsIgnoreCase(kind) || "id_patch".equalsIgnoreCase(preferStyle)) {
            op.put("type", "node_patch");
            op.put("selector", Map.of("nodeId", ""));
            op.put("patch", Collections.emptyMap());
        } else {
            op.put("type", "search_replace");
            op.put("selector", Map.of("search", "", "expectedOccurrences", 1));
            op.put("replace", "");
        }
        return List.of(op);
    }

    private double estimateTouchedPercent(String currentContent, List<Map<String, Object>> operations) {
        int base = Math.max(1, currentContent == null ? 0 : currentContent.length());
        int touched = 0;
        for (Map<String, Object> op : operations) {
            touched += strKeep(op.get("replace"), "").length();
            Object patchObj = op.get("patch");
            if (patchObj instanceof Map<?, ?> patch) {
                touched += objectMapper.valueToTree(patch).toString().length();
            }
        }
        return Math.min(100.0, (touched * 100.0) / base);
    }

    private ApplyEditsResult applyMenuJsonOperations(String currentContent, List<Map<String, Object>> operations)
            throws IOException {
        ApplyEditsResult result = new ApplyEditsResult();
        if (currentContent == null || currentContent.isBlank()) {
            result.resultContent = "{\"menu\":[]}";
        } else {
            result.resultContent = currentContent;
        }

        Object parsed = objectMapper.readValue(result.resultContent, Object.class);
        Object menuContainer = parsed;
        boolean wrappedByMenu = false;
        if (parsed instanceof Map<?, ?> map && map.get("menu") != null) {
            menuContainer = map.get("menu");
            wrappedByMenu = true;
        }
        if (!(menuContainer instanceof List<?>)) {
            result.conflicts.add(Map.of("operationId", "_all", "reason", "invalid_menu_json", "detail", "menu must be array"));
            return result;
        }

        @SuppressWarnings("unchecked")
        List<Object> menuList = (List<Object>) menuContainer;

        for (Map<String, Object> op : operations) {
            String opId = str(op.get("id"), UUID.randomUUID().toString());
            String type = str(op.get("type"), "node_patch");
            if (!"node_patch".equalsIgnoreCase(type)) {
                result.skippedOperationIds.add(opId);
                result.conflicts.add(Map.of("operationId", opId, "reason", "unsupported_operation", "detail", type));
                continue;
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> selector = op.get("selector") instanceof Map<?, ?>
                    ? (Map<String, Object>) op.get("selector")
                    : Collections.emptyMap();
            @SuppressWarnings("unchecked")
            Map<String, Object> patch = op.get("patch") instanceof Map<?, ?>
                    ? (Map<String, Object>) op.get("patch")
                    : Collections.emptyMap();
            String nodeId = str(selector.get("nodeId"), "");

            if (nodeId.isBlank() || patch.isEmpty()) {
                result.skippedOperationIds.add(opId);
                result.conflicts.add(Map.of("operationId", opId, "reason", "invalid_operation", "detail", "nodeId/patch missing"));
                continue;
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> found = findMenuNodeByIdObject(menuList, nodeId);
            if (found == null) {
                result.skippedOperationIds.add(opId);
                result.conflicts.add(Map.of("operationId", opId, "reason", "node_not_found", "detail", nodeId));
                continue;
            }

            Map<String, Object> before = new LinkedHashMap<>(found);
            for (Map.Entry<String, Object> entry : patch.entrySet()) {
                found.put(entry.getKey(), entry.getValue());
            }
            result.appliedOperationIds.add(opId);

            int[] lines = estimateNodeLineRange(result.resultContent, nodeId);
            result.hunks.add(Map.of(
                    "hunkId", "hunk_" + opId,
                    "action", "edit",
                    "fromLine", lines[0],
                    "toLine", lines[1],
                    "previewOld", truncateMiddle(objectMapper.writeValueAsString(before), 240),
                    "previewNew", truncateMiddle(objectMapper.writeValueAsString(found), 240)));
        }

        if (wrappedByMenu && parsed instanceof Map<?, ?> map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> mutable = new LinkedHashMap<>((Map<String, Object>) map);
            mutable.put("menu", menuList);
            result.resultContent = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(mutable);
        } else {
            result.resultContent = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(menuList);
        }
        return result;
    }

    private Map<String, Object> findMenuNodeByIdObject(List<Object> nodes, String nodeId) {
        for (Object rawNode : nodes) {
            if (!(rawNode instanceof Map<?, ?> mapNode)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> node = (Map<String, Object>) mapNode;
            if (nodeId.equals(str(node.get("id"), ""))) {
                return node;
            }
            Object childrenRaw = node.get("children");
            if (childrenRaw instanceof List<?> children) {
                @SuppressWarnings("unchecked")
                Map<String, Object> found = findMenuNodeByIdObject((List<Object>) children, nodeId);
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }

    private int[] estimateNodeLineRange(String json, String nodeId) {
        String needle = "\"id\"";
        int pos = json.indexOf(needle + " : \"" + nodeId + "\"");
        if (pos < 0) {
            pos = json.indexOf("\"id\":\"" + nodeId + "\"");
        }
        if (pos < 0) {
            pos = json.indexOf(nodeId);
        }
        if (pos < 0) {
            return new int[] {1, 1};
        }
        int line = 1;
        for (int i = 0; i < pos && i < json.length(); i++) {
            if (json.charAt(i) == '\n') {
                line++;
            }
        }
        return new int[] {line, line};
    }

    private ApplyEditsResult applyCodeDocOperations(String currentContent, List<Map<String, Object>> operations) {
        ApplyEditsResult result = new ApplyEditsResult();
        String working = String.valueOf(currentContent == null ? "" : currentContent);

        for (Map<String, Object> op : operations) {
            String opId = str(op.get("id"), UUID.randomUUID().toString());
            String type = str(op.get("type"), "search_replace");
            if (!"search_replace".equalsIgnoreCase(type)) {
                result.skippedOperationIds.add(opId);
                result.conflicts.add(Map.of("operationId", opId, "reason", "unsupported_operation", "detail", type));
                continue;
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> selector = op.get("selector") instanceof Map<?, ?>
                    ? (Map<String, Object>) op.get("selector")
                    : Collections.emptyMap();
            String search = strKeep(selector.get("search"), "");
            String beforeContext = strKeep(selector.get("beforeContext"), "");
            String afterContext = strKeep(selector.get("afterContext"), "");
            int expectedOccurrences = Math.max(1, parseIntSafe(selector.get("expectedOccurrences"), 1));
            String replace = strKeep(op.get("replace"), "");

            if (search.isBlank()) {
                result.skippedOperationIds.add(opId);
                result.conflicts.add(Map.of("operationId", opId, "reason", "invalid_operation", "detail", "search is blank"));
                continue;
            }

            String workingSnapshot = working;
            List<Integer> candidates = findAllIndexes(workingSnapshot, search);
            if (!beforeContext.isBlank()) {
                candidates.removeIf(idx -> !containsNearBefore(workingSnapshot, idx, beforeContext));
            }
            if (!afterContext.isBlank()) {
                candidates.removeIf(idx -> !containsNearAfter(workingSnapshot, idx + search.length(), afterContext));
            }

            if (candidates.isEmpty()) {
                result.skippedOperationIds.add(opId);
                result.conflicts.add(Map.of("operationId", opId, "reason", "search_not_found", "detail", truncateMiddle(search, 120)));
                continue;
            }
            if (candidates.size() != expectedOccurrences) {
                result.skippedOperationIds.add(opId);
                result.conflicts.add(Map.of("operationId", opId, "reason", "ambiguous_match", "detail", "matches=" + candidates.size()));
                continue;
            }

            int idx = candidates.get(0);
            int fromLine = lineNumberAtOffset(working, idx);
            int toLine = lineNumberAtOffset(working, idx + search.length());
            String oldPreview = truncateMiddle(search, 240);
            String newPreview = truncateMiddle(replace, 240);

            working = working.substring(0, idx) + replace + working.substring(idx + search.length());
            result.appliedOperationIds.add(opId);
            result.hunks.add(Map.of(
                    "hunkId", "hunk_" + opId,
                    "action", "edit",
                    "fromLine", fromLine,
                    "toLine", toLine,
                    "previewOld", oldPreview,
                    "previewNew", newPreview));
        }

        result.resultContent = working;
        return result;
    }

    private List<Integer> findAllIndexes(String text, String needle) {
        List<Integer> out = new ArrayList<>();
        if (text == null || needle == null || needle.isEmpty()) {
            return out;
        }
        int from = 0;
        while (from <= text.length() - needle.length()) {
            int idx = text.indexOf(needle, from);
            if (idx < 0) break;
            out.add(idx);
            from = idx + Math.max(1, needle.length());
        }
        return out;
    }

    private boolean containsNearBefore(String text, int idx, String beforeContext) {
        int start = Math.max(0, idx - 1500);
        String window = text.substring(start, Math.max(start, idx));
        return window.contains(beforeContext);
    }

    private boolean containsNearAfter(String text, int idx, String afterContext) {
        int end = Math.min(text.length(), idx + 1500);
        String window = text.substring(Math.min(idx, end), end);
        return window.contains(afterContext);
    }

    private int lineNumberAtOffset(String text, int offset) {
        String safeText = text == null ? "" : text;
        int capped = Math.max(0, Math.min(offset, safeText.length()));
        int line = 1;
        for (int i = 0; i < capped; i++) {
            if (safeText.charAt(i) == '\n') line++;
        }
        return line;
    }

    private CodeWindowContext extractCodeWindowByLine(String code, int cursorLine, int contextWindowLines) {
        String source = String.valueOf(code == null ? "" : code);
        if (source.isBlank() || cursorLine <= 0) {
            return new CodeWindowContext(source, 1, Math.max(1, source.split("\\n", -1).length));
        }
        String[] lines = source.split("\\n", -1);
        int totalLines = Math.max(1, lines.length);
        int radius = Math.max(10, Math.min(400, contextWindowLines));
        int center = Math.min(totalLines, Math.max(1, cursorLine));
        int start = Math.max(1, center - radius);
        int end = Math.min(totalLines, center + radius);

        StringBuilder sb = new StringBuilder();
        for (int i = start; i <= end; i++) {
            sb.append(lines[i - 1]);
            if (i < end) {
                sb.append("\n");
            }
        }
        return new CodeWindowContext(sb.toString(), start, end);
    }

    private int parseIntSafe(Object raw, int fallback) {
        if (raw == null) return fallback;
        try {
            return Integer.parseInt(String.valueOf(raw).trim());
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private String sha256Hex(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(String.valueOf(raw == null ? "" : raw).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ignored) {
            return String.valueOf(raw == null ? "" : raw).hashCode() + "";
        }
    }

    private String buildCodingPrompt(String message, String currentCode, String language,
            String contextType, String responseMode, Object attachmentsRaw) {
        return buildCodingPrompt(message, currentCode, language, contextType, responseMode, attachmentsRaw,
                false, "", currentCode == null ? 0 : currentCode.length());
    }

    private String buildCodingPrompt(String message, String currentCode, String language,
            String contextType, String responseMode, Object attachmentsRaw,
            boolean largeStructuredEditMode, String baseRef, int baseChars) {
        StringBuilder sb = new StringBuilder();
        boolean menuJsonEditMode = "edit".equalsIgnoreCase(responseMode) && isMenuJsonContext(contextType);

        sb.append("Bạn là AI trợ lý lập trình (như Cursor/Copilot). Hỗ trợ người dùng chính xác và chi tiết.\n\n");

        if (largeStructuredEditMode) {
            sb.append("CHẾ ĐỘ: Chỉnh sửa dữ liệu rất lớn. KHÔNG trả về full code trực tiếp.\n");
            sb.append("Bắt buộc trả về JSON thuần đúng format:\n");
            sb.append("{\"summary\":\"...\",\"changes\":[\"...\"],\"textEdits\":[{\"find\":\"chuỗi cũ chính xác\",\"replace\":\"chuỗi mới\"}]}\n");
            sb.append("Quy tắc:\n");
            sb.append("- Mỗi textEdits.find phải là chuỗi cũ chính xác cần thay, đủ unique.\n");
            sb.append("- Không dùng markdown, không dùng code fence.\n");
            sb.append("- Không trả về trường code. Backend sẽ tự áp patch để tạo full code.\n\n");
            if (baseRef != null && !baseRef.isBlank()) {
                sb.append("BASE_CONTENT_REF: ").append(baseRef).append("\n");
                sb.append("BASE_CONTENT_CHARS: ").append(baseChars).append("\n\n");
            }
        } else if ("edit".equalsIgnoreCase(responseMode)) {
            if (menuJsonEditMode) {
                sb.append("CHẾ ĐỘ: Chỉnh sửa menu JSON cho editor.\n");
                sb.append("BẮT BUỘC: Trả về DUY NHẤT một JSON hợp lệ cho menu editor.\n");
                sb.append("Đầu ra phải là object chứa trường menu (ví dụ: {\"menu\":[...]}) hoặc mảng menu thuần.\n");
                sb.append("Không trả về wrapper {\"summary\",\"code\",\"changes\"}.\n");
                sb.append("Không markdown, không code fence, không giải thích ngoài JSON.\n\n");
            } else {
                sb.append("CHẾ ĐỘ: Chỉnh sửa code theo vị trí dòng.\n");
                sb.append("ƯU TIÊN CAO NHẤT: trả về các khối SEARCH/REPLACE để backend ráp đúng vùng code:\n");
                sb.append("<<<<<<< SEARCH\n[đoạn code cũ]\n=======\n[đoạn code mới]\n>>>>>>> REPLACE\n");
                sb.append("Mỗi SEARCH phải đủ unique theo ngữ cảnh thật và giữ nguyên whitespace/tab.\n");
                sb.append("Ưu tiên trả về JSON thuần theo format:\n");
                sb.append("{\"summary\":\"...\",\"changes\":[\"...\"],\"textEdits\":[{\"startLine\":10,\"endLine\":12,\"replacement\":\"...\",\"action\":\"edit\"}]}\n");
                sb.append("Trong đó textEdits phải không chồng lấn và chỉ chỉnh đúng phạm vi cần thiết.\n");
                sb.append("Chỉ fallback trả về {\"summary\",\"code\",\"changes\"} khi không thể biểu diễn bằng SEARCH/REPLACE hoặc textEdits.\n");
                sb.append("Không markdown, không code fence.\n\n");
            }
        } else {
            sb.append("CHẾ ĐỘ: Phân tích/Giải thích. Phân tích và giải thích chi tiết.\n\n");
        }

        if (attachmentsRaw instanceof List<?> attachments && !attachments.isEmpty()) {
            sb.append("## TÀI LIỆU ĐÍNH KÈM\n");
            int attachmentBudget = Math.max(10000, aiCodeStreamMaxAttachmentsTotalChars);
            for (Object att : attachments) {
                if (attachmentBudget <= 0) {
                    break;
                }
                if (att instanceof Map<?, ?> attMap) {
                    String name = str(attMap.get("name"), "file");
                    String content = str(attMap.get("textContent"), "");
                    if (!content.isBlank()) {
                        int perFileCap = Math.max(2000, aiCodeStreamMaxAttachmentCharsPerFile);
                        String safe = truncateMiddle(content, Math.min(perFileCap, attachmentBudget));
                        attachmentBudget -= safe.length();
                        sb.append("### ").append(name).append("\n```\n").append(safe).append("\n```\n\n");
                    }
                }
            }
        }

        if (!currentCode.isBlank()) {
            String safeCode = truncateMiddle(currentCode, Math.max(4000, aiCodeStreamMaxCurrentCodeChars));
            sb.append("## CODE HIỆN TẠI (").append(language).append(")\n```").append(language).append("\n");
            sb.append(safeCode);
            sb.append("\n```\n\n");
        }

        sb.append("## YÊU CẦU\n").append(message).append("\n");

        return sb.toString();
    }

    @SuppressWarnings("unused")
    private String streamWithAutoContinue(
            SseEmitter emitter,
            String prompt,
            String model,
            String language,
            String contextType,
            String responseMode,
            boolean largeStructuredEditMode,
            String requestId) throws Exception {
        return streamWithAutoContinue(emitter, prompt, "", "", model, language, contextType, responseMode, largeStructuredEditMode, false,
            new LinkedHashMap<>(), requestId);
    }

    private String streamWithAutoContinueMultimodal(
            SseEmitter emitter,
            String prompt,
            List<Map<String, String>> imageParts,
            String model,
            String language,
            String responseMode,
            String requestId) throws Exception {
        StringBuilder responseBuffer = new StringBuilder();
        final boolean[] errored = { false };
        AtomicInteger waitingLogBucket = new AtomicInteger(0);

        geminiStreamingService.streamContentMultimodal(
                prompt,
                imageParts,
                model,
                chunk -> {
                    try {
                        String escaped = chunk.replace("\\", "\\\\").replace("\n", "\\n").replace("\"", "\\\"");
                        sendEvent(emitter, "{\"stage\":\"streaming\",\"chunk\":\"" + escaped + "\"}");
                        responseBuffer.append(chunk);
                    } catch (Exception e) {
                        logger.warn("ApiSpringController multimodal: error sending chunk: {}", e.getMessage());
                    }
                },
                () -> {
                },
                ex -> {
                    errored[0] = true;
                    logger.error("ApiSpringController multimodal stream error: {}", ex.getMessage(), ex);
                    try {
                        sendErrorEvent(emitter, "Lỗi Gemini multimodal: " + ex.getMessage());
                    } catch (Exception ignored) {
                    }
                },
                status -> {
                    try {
                        Map<String, Object> wrapped = new LinkedHashMap<>(status);
                        wrapped.put("requestId", requestId);
                        logAiCodeStreamStatusHeartbeat(requestId, model, wrapped, waitingLogBucket);
                        sendEvent(emitter, objectMapper.writeValueAsString(wrapped));
                    } catch (Exception ignored) {
                    }
                });

        if (errored[0]) return null;
        return responseBuffer.toString();
    }

    private String streamWithAutoContinue(
            SseEmitter emitter,
            String prompt,
            String systemContent,
            String userMessage,
            String model,
            String language,
            String contextType,
            String responseMode,
            boolean largeStructuredEditMode,
            boolean usePromptCache,
            Map<String, Object> streamMeta,
            String requestId) throws Exception {
        boolean editMode = "edit".equalsIgnoreCase(responseMode);
        int autoContinueAttempts = editMode && aiCodeStreamAutoContinueEnabled ? Math.max(1, aiCodeStreamAutoContinueMaxAttempts) : 1;
        int textEditRetryAttempts = (editMode && aiCodeStreamEditTextEditsRetryEnabled)
                ? 1 + Math.max(0, aiCodeStreamEditTextEditsRetryMaxExtraAttempts)
                : 1;
        int maxAttempts = Math.max(autoContinueAttempts, textEditRetryAttempts);
        String currentPrompt = prompt;
        String lastRawResponse = "";
        AtomicInteger waitingLogBucket = new AtomicInteger(0);
        int textEditsRetryUsed = 0;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            final int attemptNo = attempt;
            if (attempt > 1) {
                sendEvent(emitter, jsonOf(
                        "stage", "continuing",
                        "status", "auto_continue",
                        "model", model,
                        "modelDecisionStep", "fallback",
                        "modelDecisionReason", "auto_continue",
                    "decision_step", "fallback",
                    "reason_code", "auto_continue",
                        "attempt", attemptNo,
                        "maxAttempts", maxAttempts,
                        "message", "Đang tự động tiếp tục để hoàn thiện kết quả..."));
            }

            StringBuilder attemptBuffer = new StringBuilder();
            Throwable[] errorHolder = { null };

            boolean isFirstAttemptWithCache = (attempt == 1) && usePromptCache
                    && systemContent != null && !systemContent.isBlank()
                    && userMessage != null && !userMessage.isBlank();

            Consumer<String> chunkHandler = chunk -> {
                attemptBuffer.append(chunk);
                try {
                    sendEvent(emitter, objectMapper.writeValueAsString(Map.of(
                            "stage", "streaming",
                            "chunk", chunk,
                            "attempt", attemptNo)));
                } catch (Exception ignored) {
                }
            };

            if (isFirstAttemptWithCache) {
                geminiStreamingService.streamContentWithCache(
                        systemContent,
                        userMessage,
                        model,
                        chunkHandler,
                        null,
                        err -> errorHolder[0] = err,
                        status -> {
                            try {
                                Map<String, Object> wrapped = new LinkedHashMap<>(status);
                                enrichModelDecisionMetadata(wrapped, model);
                                wrapped.put("requestId", requestId);
                                wrapped.put("attempt", attemptNo);
                                wrapped.put("maxAttempts", maxAttempts);
                                logAiCodeStreamStatusHeartbeat(requestId, model, wrapped, waitingLogBucket);
                                sendEvent(emitter, objectMapper.writeValueAsString(wrapped));
                            } catch (Exception ignored) {
                            }
                        });
            } else {
                geminiStreamingService.streamContent(
                        currentPrompt,
                        model,
                        chunkHandler,
                        null,
                        err -> errorHolder[0] = err,
                        status -> {
                            try {
                                Map<String, Object> wrapped = new LinkedHashMap<>(status);
                                enrichModelDecisionMetadata(wrapped, model);
                                wrapped.put("requestId", requestId);
                                wrapped.put("attempt", attemptNo);
                                wrapped.put("maxAttempts", maxAttempts);
                                logAiCodeStreamStatusHeartbeat(requestId, model, wrapped, waitingLogBucket);
                                sendEvent(emitter, objectMapper.writeValueAsString(wrapped));
                            } catch (Exception ignored) {
                            }
                        });
            }

            if (errorHolder[0] != null) {
                logger.warn("ApiSpringController: ai-code-stream failed model={} attempt={}/{} error={}",
                        model, attemptNo, maxAttempts, errorHolder[0].getMessage());
                sendEvent(emitter, jsonOf(
                    "stage", "model_switch",
                    "status", "failed",
                    "model", model,
                    "modelDecisionStep", "fallback",
                    "modelDecisionReason", classifyModelDecisionReasonCode(
                        "error=" + String.valueOf(errorHolder[0].getMessage()),
                        "model_switch",
                        "failed"),
                    "decision_step", "fallback",
                    "reason_code", classifyModelDecisionReasonCode(
                        "error=" + String.valueOf(errorHolder[0].getMessage()),
                        "model_switch",
                        "failed"),
                    "attempt", attemptNo,
                    "maxAttempts", maxAttempts,
                    "message", "Model stream failed, triggering fallback path"));

                // Graceful degrade: if a previous attempt already produced content, keep it
                // instead of failing the whole request because a later auto-continue attempt failed.
                if (!lastRawResponse.isBlank()) {
                    sendEvent(emitter, jsonOf(
                            "stage", "auto_continue",
                            "status", "partial_kept",
                            "attempt", attemptNo,
                            "maxAttempts", maxAttempts,
                            "message", "Attempt tiếp theo lỗi, giữ kết quả khả dụng từ attempt trước"));
                    break;
                }

                // If no content yet, allow retry on next attempt when available.
                if (attemptNo < maxAttempts) {
                    sendEvent(emitter, jsonOf(
                            "stage", "continuing",
                            "status", "retry_after_error",
                            "attempt", attemptNo,
                            "maxAttempts", maxAttempts,
                            "message", "Lỗi tạm thời, thử lại cùng prompt"));
                    continue;
                }

                return null;
            }

            String raw = attemptBuffer.toString();
            lastRawResponse = raw;

            if (isCompleteResponse(raw, language, contextType, responseMode, largeStructuredEditMode)) {
                boolean shouldRetryForTextEdits = shouldRetryForLineTextEdits(
                        prompt,
                        contextType,
                        responseMode,
                        largeStructuredEditMode,
                        raw,
                        attemptNo,
                        maxAttempts,
                        textEditsRetryUsed);

                if (shouldRetryForTextEdits) {
                    textEditsRetryUsed++;
                    if (streamMeta != null) {
                        streamMeta.put("textEditsRetryTriggered", true);
                        streamMeta.put("textEditsRetryAttempts", textEditsRetryUsed);
                    }
                    sendEvent(emitter, jsonOf(
                            "stage", "auto_continue",
                            "status", "text_edits_retry",
                            "attempt", attemptNo,
                            "maxAttempts", maxAttempts,
                            "message", "Kết quả đang là full code, backend yêu cầu model trả về textEdits theo line để apply chính xác"));
                    currentPrompt = buildTextEditsRetryPrompt(prompt, raw, language, contextType, largeStructuredEditMode);
                    continue;
                }

                if (attempt > 1) {
                    sendEvent(emitter, jsonOf(
                            "stage", "auto_continue",
                            "status", "completed",
                            "attempt", attemptNo,
                            "maxAttempts", maxAttempts,
                            "message", "Đã tự động hoàn thiện kết quả trong backend"));
                }
                if (streamMeta != null) {
                    streamMeta.put("textEditsRetryTriggered", textEditsRetryUsed > 0);
                    streamMeta.put("textEditsRetryAttempts", textEditsRetryUsed);
                }
                return raw;
            }

            if (attempt < maxAttempts) {
                currentPrompt = buildAutoContinuePrompt(prompt, raw, language, contextType, largeStructuredEditMode);
            }
        }

        if (streamMeta != null) {
            streamMeta.put("textEditsRetryTriggered", textEditsRetryUsed > 0);
            streamMeta.put("textEditsRetryAttempts", textEditsRetryUsed);
        }

        return lastRawResponse;
    }

    private void logAiCodeStreamStatusHeartbeat(String requestId, String model, Map<String, Object> status,
            AtomicInteger waitingLogBucket) {
        String stage = str(status.get("stage"), "");
        if ("streaming_started".equalsIgnoreCase(stage)) {
            long ttftMs = parseLongOrDefault(status.get("ttftMs"), -1L);
            if (ttftMs >= 0) {
                logger.info("ApiSpringController: ai-code-stream first-token requestId={} model={} ttftMs={}",
                        requestId, model, ttftMs);
            }
            return;
        }
        if (!"waiting_gemini".equalsIgnoreCase(stage)) {
            return;
        }
        long elapsedMs = parseLongOrDefault(status.get("elapsedMs"), -1L);
        if (elapsedMs < 0) {
            return;
        }
        int bucket = (int) (elapsedMs / 15000L);
        if (bucket <= 0) {
            return;
        }
        int previousBucket = waitingLogBucket.get();
        if (bucket <= previousBucket || !waitingLogBucket.compareAndSet(previousBucket, bucket)) {
            return;
        }
        long elapsedSecs = Math.max(1L, elapsedMs / 1000L);
        long estimatedWaitSecs = parseLongOrDefault(status.get("estimatedWaitSecs"), 0L);
        String waitState = str(status.get("waitState"), "estimated");
        logger.info(
                "ApiSpringController: ai-code-stream waiting requestId={} model={} elapsedSecs={} estimatedWaitSecs={} waitState={}",
                requestId, model, elapsedSecs, estimatedWaitSecs, waitState);
    }

    private String buildAutoContinuePrompt(String originalPrompt, String previousRawResponse, String language,
            String contextType,
            boolean largeStructuredEditMode) {
        StringBuilder sb = new StringBuilder();
        sb.append("KẾT QUẢ VỪA RỒI CHƯA HOÀN CHỈNH (bị cắt giữa chừng). Hãy trả về lại 1 lần DUY NHẤT, đầy đủ và hợp lệ.\n\n");
        if (largeStructuredEditMode) {
            sb.append("BẮT BUỘC format JSON: {\"summary\":\"...\",\"changes\":[...],\"textEdits\":[{\"find\":\"...\",\"replace\":\"...\"}]}\n");
            sb.append("Không markdown, không code fence, không giải thích thêm.\n\n");
        } else if (isMenuJsonContext(contextType)) {
            sb.append("BẮT BUỘC: Trả về DUY NHẤT JSON menu hợp lệ, đầy đủ từ đầu đến cuối.\n");
            sb.append("Đầu ra phải là object chứa trường menu hoặc mảng menu thuần.\n");
            sb.append("Không dùng wrapper {\"summary\",\"code\",\"changes\"}.\n");
            sb.append("Không markdown, không code fence, không cắt bớt.\n\n");
        } else if ("json".equalsIgnoreCase(language)) {
            sb.append("BẮT BUỘC: Trả về JSON hợp lệ, đầy đủ từ đầu đến cuối trong wrapper: {\"summary\":\"...\",\"code\":\"toàn bộ JSON hoàn chỉnh\",\"changes\":[...]}\n");
            sb.append("QUAN TRỌNG: Trường 'code' phải chứa toàn bộ JSON hợp lệ (không được bỏ sót bất kỳ phần nào, mở { phải có đóng }).\n");
            sb.append("Không markdown, không code fence, không cắt bớt.\n\n");
        } else {
            sb.append("BẮT BUỘC format JSON: {\"summary\":\"...\",\"code\":\"toàn bộ code hoàn chỉnh\",\"changes\":[...]}\n");
            sb.append("Không markdown, không code fence, không trả về một đoạn rời.\n\n");
        }
        sb.append("--- YÊU CẦU GỐC ---\n");
        sb.append(truncateMiddle(originalPrompt, Math.max(20000, aiCodeStreamMaxPromptChars))).append("\n\n");
        sb.append("--- KẾT QUẢ TRƯỚC (CHƯA HOÀN CHỈNH - BỊ CẮT) ---\n");
        sb.append(truncateMiddle(previousRawResponse, Math.max(8000, aiCodeStreamAutoContinueMaxPreviousResponseChars))).append("\n");
        return sb.toString();
    }

    private String buildTextEditsRetryPrompt(String originalPrompt, String previousRawResponse, String language,
            String contextType,
            boolean largeStructuredEditMode) {
        if (largeStructuredEditMode) {
            return buildAutoContinuePrompt(originalPrompt, previousRawResponse, language, contextType, true);
        }
        StringBuilder sb = new StringBuilder();
        sb.append("ĐIỀU CHỈNH ĐỊNH DẠNG KẾT QUẢ: backend cần apply theo line-level edits để tránh ghi đè cả file.\n");
        sb.append("BẮT BUỘC trả về JSON thuần dạng:\n");
        sb.append("{\"summary\":\"...\",\"changes\":[\"...\"],\"textEdits\":[{\"startLine\":10,\"endLine\":12,\"replacement\":\"...\",\"action\":\"edit\"}]}\n");
        sb.append("Quy tắc:\n");
        sb.append("- Không markdown, không code fence.\n");
        sb.append("- textEdits không chồng lấn nhau.\n");
        sb.append("- Chỉ sửa vùng cần thiết, không thay toàn bộ file.\n\n");
        sb.append("--- YÊU CẦU GỐC ---\n");
        sb.append(truncateMiddle(originalPrompt, Math.max(20000, aiCodeStreamMaxPromptChars))).append("\n\n");
        sb.append("--- KẾT QUẢ TRƯỚC (SAI ĐỊNH DẠNG, ĐANG LÀ FULL CODE) ---\n");
        sb.append(truncateMiddle(previousRawResponse, Math.max(8000, aiCodeStreamAutoContinueMaxPreviousResponseChars))).append("\n");
        return sb.toString();
    }

    private boolean shouldRetryForLineTextEdits(
            String prompt,
            String contextType,
            String responseMode,
            boolean largeStructuredEditMode,
            String rawResponse,
            int attemptNo,
            int maxAttempts,
            int textEditsRetryUsed) {
        if (!aiCodeStreamEditTextEditsRetryEnabled) return false;
        if (!"edit".equalsIgnoreCase(responseMode)) return false;
        if (isMenuJsonContext(contextType)) return false;
        if (largeStructuredEditMode) return false;
        if (attemptNo >= maxAttempts) return false;
        if (textEditsRetryUsed >= Math.max(0, aiCodeStreamEditTextEditsRetryMaxExtraAttempts)) return false;

        // Keep retry available for long prompts by only hard-stopping at extreme sizes.
        if (prompt != null && prompt.length() > Math.max(12000, aiCodeStreamEditTextEditsRetryMaxPromptChars * 3)) return false;

        int textEditsCount = extractLineTextEditsCount(rawResponse);
        if (textEditsCount > 0) return false;
        if (hasSearchReplaceBlocks(rawResponse)) return false;

        return hasFullCodeInEditPayload(rawResponse);
    }

    private Map<String, Object> analyzeCodeStreamOutputShape(
            String responseMode,
            String contextType,
            String completionPayload,
            boolean largeStructuredEditMode) {
        Map<String, Object> out = new LinkedHashMap<>();
        String mode = String.valueOf(responseMode == null ? "" : responseMode).trim();
        String ctx = String.valueOf(contextType == null ? "" : contextType).trim();

        int textEditsCount = extractLineTextEditsCount(completionPayload);
        boolean hasFullCode = hasFullCodeInEditPayload(completionPayload);

        String outputShape;
        if (!"edit".equalsIgnoreCase(mode)) {
            outputShape = "non_edit";
        } else if (isMenuJsonContext(ctx)) {
            outputShape = "menu_json";
        } else if (largeStructuredEditMode) {
            outputShape = textEditsCount > 0 ? "text_edits_find_replace" : "unknown";
        } else if (textEditsCount > 0) {
            outputShape = "text_edits_line";
        } else if (hasFullCode) {
            outputShape = "full_code";
        } else {
            outputShape = "unknown";
        }

        out.put("outputShape", outputShape);
        out.put("textEditsCount", textEditsCount);
        out.put("fallbackToFullCode", "full_code".equals(outputShape));
        return out;
    }

    private int extractLineTextEditsCount(String rawResponse) {
        String normalized = String.valueOf(rawResponse == null ? "" : rawResponse).trim();
        if (normalized.isBlank()) return 0;
        if (normalized.startsWith("```json")) normalized = normalized.substring(7).trim();
        if (normalized.startsWith("```")) normalized = normalized.substring(3).trim();
        if (normalized.endsWith("```")) normalized = normalized.substring(0, normalized.length() - 3).trim();
        try {
            Map<?, ?> obj = objectMapper.readValue(normalized, Map.class);
            Object edits = obj.get("textEdits") != null ? obj.get("textEdits") : obj.get("text_edits");
            if (!(edits instanceof List<?> list)) {
                return 0;
            }
            int count = 0;
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    boolean hasLine = map.get("startLine") != null || map.get("start_line") != null
                            || map.get("line") != null || map.get("range") instanceof Map<?, ?>;
                    boolean hasReplace = map.get("replacement") != null || map.get("newText") != null
                            || map.get("text") != null;
                    if (hasLine && hasReplace) {
                        count++;
                    }
                }
            }
            return count;
        } catch (Exception ex) {
            return 0;
        }
    }

    private boolean hasFullCodeInEditPayload(String rawResponse) {
        ParsedCodePayload payload = parseCodePayload(rawResponse);
        return payload != null && payload.code() != null && !payload.code().isBlank();
    }

    private boolean hasSearchReplaceBlocks(String rawResponse) {
        return !parseSearchReplaceBlocks(rawResponse).isEmpty();
    }

    private List<SearchReplaceBlock> parseSearchReplaceBlocks(String rawResponse) {
        String raw = String.valueOf(rawResponse == null ? "" : rawResponse).trim();
        if (raw.isBlank()) {
            return List.of();
        }
        if (raw.startsWith("```")) {
            raw = raw.replaceFirst("^```[a-zA-Z]*\\s*", "").replaceAll("\\s*```$", "").trim();
        }

        Pattern pattern = Pattern.compile("<<<<<<<\\s*SEARCH\\s*\\n([\\s\\S]*?)\\n=======\\s*\\n([\\s\\S]*?)\\n>>>>>>>\\s*REPLACE");
        Matcher matcher = pattern.matcher(raw);
        List<SearchReplaceBlock> blocks = new ArrayList<>();
        while (matcher.find()) {
            String search = String.valueOf(matcher.group(1) == null ? "" : matcher.group(1));
            String replace = String.valueOf(matcher.group(2) == null ? "" : matcher.group(2));
            if (!search.isBlank()) {
                blocks.add(new SearchReplaceBlock(search, replace));
            }
        }
        return blocks;
    }

    private String salvageSearchReplaceAsTextEdits(String rawResponse, String baseCode) {
        String sourceCode = String.valueOf(baseCode == null ? "" : baseCode);
        if (sourceCode.isBlank()) {
            return rawResponse;
        }
        if (extractLineTextEditsCount(rawResponse) > 0 || hasFullCodeInEditPayload(rawResponse)) {
            return rawResponse;
        }

        List<SearchReplaceBlock> blocks = parseSearchReplaceBlocks(rawResponse);
        if (blocks.isEmpty()) {
            return rawResponse;
        }

        int maxEdits = Math.max(1, aiAssistantStructuredEditMaxTextEdits);
        List<Map<String, Object>> edits = new ArrayList<>();
        List<String> changes = new ArrayList<>();
        int searchFrom = 0;

        for (SearchReplaceBlock block : blocks) {
            if (block == null || block.search() == null || block.search().isBlank()) {
                continue;
            }
            String search = block.search();
            int index = sourceCode.indexOf(search, Math.max(0, searchFrom));
            if (index < 0) {
                index = sourceCode.indexOf(search);
            }
            if (index < 0) {
                continue;
            }

            int startLine = lineNumberAtOffset(sourceCode, index);
            int endLine = lineNumberAtOffset(sourceCode, index + Math.max(0, search.length() - 1));
            Map<String, Object> edit = new LinkedHashMap<>();
            edit.put("startLine", startLine);
            edit.put("endLine", endLine);
            edit.put("replacement", String.valueOf(block.replace() == null ? "" : block.replace()));
            edit.put("action", "edit");
            edits.add(edit);
            changes.add("Patch block lines " + startLine + "-" + endLine);
            searchFrom = index + Math.max(1, search.length());
            if (edits.size() >= maxEdits) {
                break;
            }
        }

        if (edits.isEmpty()) {
            return rawResponse;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", "Đã chuyển SEARCH/REPLACE thành textEdits theo line");
        out.put("changes", changes);
        out.put("textEdits", edits);
        out.put("meta", Map.of("salvagedFromSearchReplace", true, "blockCount", blocks.size()));
        try {
            return objectMapper.writeValueAsString(out);
        } catch (Exception ex) {
            return rawResponse;
        }
    }

    private String salvagePropertyPatchAsTextEdits(String rawResponse, String baseCode) {
        String raw = String.valueOf(rawResponse == null ? "" : rawResponse).trim();
        String sourceCode = String.valueOf(baseCode == null ? "" : baseCode);
        if (raw.isBlank() || sourceCode.isBlank()) {
            return rawResponse;
        }

        // Only salvage when model did not already provide a supported edit payload.
        if (extractLineTextEditsCount(raw) > 0 || hasFullCodeInEditPayload(raw)) {
            return rawResponse;
        }

        String normalized = raw;
        if (normalized.startsWith("```json")) normalized = normalized.substring(7).trim();
        if (normalized.startsWith("```")) normalized = normalized.substring(3).trim();
        if (normalized.endsWith("```")) normalized = normalized.substring(0, normalized.length() - 3).trim();

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = objectMapper.readValue(normalized, Map.class);
            if (payload == null || payload.isEmpty() || payload.size() > 4) {
                return rawResponse;
            }

            List<Map<String, Object>> textEdits = new ArrayList<>();
            List<String> changes = new ArrayList<>();
            int maxEdits = Math.max(1, aiAssistantStructuredEditMaxTextEdits);

            for (Map.Entry<String, Object> entry : payload.entrySet()) {
                if (entry == null) continue;
                String property = String.valueOf(entry.getKey() == null ? "" : entry.getKey()).trim();
                if (property.isBlank()) continue;

                Map<String, Object> edit = buildPropertyLineEdit(sourceCode, property, entry.getValue());
                if (edit == null || edit.isEmpty()) {
                    continue;
                }
                textEdits.add(edit);
                changes.add("Patch property: " + property);
                if (textEdits.size() >= maxEdits) {
                    break;
                }
            }

            if (textEdits.isEmpty()) {
                return rawResponse;
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("summary", "Đã chuyển payload partial thành textEdits theo vị trí dòng");
            out.put("changes", changes);
            out.put("textEdits", textEdits);
            out.put("meta", Map.of("salvagedFromPartialPayload", true));
            return objectMapper.writeValueAsString(out);
        } catch (Exception ignored) {
            return rawResponse;
        }
    }

    private Map<String, Object> buildPropertyLineEdit(String code, String propertyName, Object newValue) {
        String source = String.valueOf(code == null ? "" : code);
        if (source.isBlank() || propertyName == null || propertyName.isBlank()) {
            return null;
        }

        String quoted = "\"" + Pattern.quote(propertyName) + "\"\\s*:";
        Pattern p = Pattern.compile(quoted);
        Matcher m = p.matcher(source);
        if (!m.find()) {
            return null;
        }

        int keyStart = m.start();
        int colonIdx = source.indexOf(':', m.start());
        if (colonIdx < 0) return null;

        int valueStart = colonIdx + 1;
        while (valueStart < source.length() && Character.isWhitespace(source.charAt(valueStart))) {
            valueStart++;
        }
        if (valueStart >= source.length()) {
            return null;
        }

        int valueEnd = findJsonLikeValueEnd(source, valueStart);
        if (valueEnd <= valueStart) {
            return null;
        }

        int startLine = lineNumberAtOffset(source, keyStart);
        int endLine = lineNumberAtOffset(source, valueEnd);
        String indent = detectLineIndent(source, startLine);
        String replacement = buildPropertyReplacement(propertyName, newValue, indent);
        if (replacement.isBlank()) {
            return null;
        }

        Map<String, Object> edit = new LinkedHashMap<>();
        edit.put("startLine", startLine);
        edit.put("endLine", endLine);
        edit.put("replacement", replacement);
        edit.put("action", "edit");
        return edit;
    }

    private int findJsonLikeValueEnd(String text, int start) {
        if (text == null || text.isEmpty() || start < 0 || start >= text.length()) {
            return start;
        }
        char first = text.charAt(start);
        if (first == '{' || first == '[') {
            char open = first;
            char close = first == '{' ? '}' : ']';
            int depth = 0;
            boolean inString = false;
            boolean escaped = false;
            for (int i = start; i < text.length(); i++) {
                char c = text.charAt(i);
                if (inString) {
                    if (escaped) {
                        escaped = false;
                    } else if (c == '\\') {
                        escaped = true;
                    } else if (c == '"') {
                        inString = false;
                    }
                    continue;
                }
                if (c == '"') {
                    inString = true;
                    continue;
                }
                if (c == open) depth++;
                if (c == close) {
                    depth--;
                    if (depth == 0) {
                        return i;
                    }
                }
            }
            return text.length() - 1;
        }
        if (first == '"') {
            boolean escaped = false;
            for (int i = start + 1; i < text.length(); i++) {
                char c = text.charAt(i);
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (c == '\\') {
                    escaped = true;
                    continue;
                }
                if (c == '"') {
                    return i;
                }
            }
            return text.length() - 1;
        }

        int i = start;
        while (i < text.length()) {
            char c = text.charAt(i);
            if (c == ',' || c == '\n' || c == '\r' || c == '}') {
                return Math.max(start, i - 1);
            }
            i++;
        }
        return text.length() - 1;
    }

    private String detectLineIndent(String text, int oneBasedLine) {
        if (text == null || text.isEmpty() || oneBasedLine <= 0) {
            return "";
        }
        String[] lines = text.split("\\n", -1);
        int idx = Math.min(lines.length, Math.max(1, oneBasedLine)) - 1;
        String line = lines[idx];
        int i = 0;
        while (i < line.length() && Character.isWhitespace(line.charAt(i))) {
            i++;
        }
        return line.substring(0, i);
    }

    private String buildPropertyReplacement(String propertyName, Object newValue, String indent) {
        try {
            String valueJson = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(newValue);
            String[] valueLines = valueJson.split("\\n", -1);
            StringBuilder sb = new StringBuilder();
            if (valueLines.length == 1) {
                sb.append(indent)
                    .append("\"")
                    .append(propertyName)
                    .append("\": ")
                    .append(valueLines[0]);
                return sb.toString();
            }

            sb.append(indent)
                .append("\"")
                .append(propertyName)
                .append("\": ")
                .append(valueLines[0])
                .append("\n");
            for (int i = 1; i < valueLines.length; i++) {
                sb.append(indent).append(valueLines[i]);
                if (i < valueLines.length - 1) {
                    sb.append("\n");
                }
            }
            return sb.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private boolean isCompleteResponse(String rawResponse, String language, String contextType, String responseMode, boolean largeStructuredEditMode) {
        String raw = String.valueOf(rawResponse == null ? "" : rawResponse).trim();
        if (raw.isBlank()) {
            return false;
        }

        if ("edit".equalsIgnoreCase(responseMode) && isMenuJsonContext(contextType)) {
            String menuCandidate = extractMenuDraftForCompletion(raw, contextType);
            return !menuCandidate.isBlank();
        }

        if ("json".equalsIgnoreCase(language)) {
            String candidate = raw;
            ParsedCodePayload parsed = parseCodePayload(raw);
            if (parsed != null && !parsed.code().isBlank()) {
                candidate = parsed.code().trim();
            }
            if (candidate.startsWith("```")) {
                candidate = candidate.replaceFirst("^```[a-zA-Z]*\\s*", "").replaceAll("\\s*```$", "").trim();
            }
            try {
                objectMapper.readTree(candidate);
                return true;
            } catch (Exception ex) {
                return false;
            }
        }

        if (!"edit".equalsIgnoreCase(responseMode)) {
            return true;
        }
        if (largeStructuredEditMode) {
            ParsedTextEditPayload payload = parseTextEditPayload(raw);
            return payload != null && payload.textEdits != null && !payload.textEdits.isEmpty();
        }

        if (hasSearchReplaceBlocks(raw)) {
            return true;
        }

        ParsedCodePayload payload = parseCodePayload(raw);
        if (payload == null || payload.code().isBlank()) {
            return false;
        }

        try {
            String rawCandidate = raw.startsWith("```")
                    ? raw.replaceFirst("^```[a-zA-Z]*\\s*", "").replaceAll("\\s*```$", "").trim()
                    : raw;
            String reJson = objectMapper.writeValueAsString(objectMapper.readValue(rawCandidate, Map.class));
            if (reJson == null || reJson.isBlank()) return false;
        } catch (Exception ex) {
            return false;
        }

        return payload.code().length() >= 20;
    }

    private void sendEvent(SseEmitter emitter, String jsonData) {
        try {
            emitter.send(SseEmitter.event().data(jsonData));
        } catch (Exception ex) {
            logger.debug("Failed to send SSE event: {}", ex.getMessage());
        }
    }

    private void sendErrorEvent(SseEmitter emitter, String error) {
        try {
            Map<String, Object> data = Map.of("stage", "error", "message", error);
            emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(data)));
            emitter.complete();
        } catch (Exception ex) {
            emitter.completeWithError(ex);
        }
    }

    private List<Map<String, String>> extractImageParts(Object attachmentsRaw) {
        List<Map<String, String>> result = new ArrayList<>();
        if (!(attachmentsRaw instanceof List<?> atts)) return result;
        for (Object att : atts) {
            if (!(att instanceof Map<?, ?> m)) continue;
            String kind = str(m.get("kind"), "");
            if (!"image".equals(kind)) continue;
            String base64Data = str(m.get("base64Data"), "");
            String mimeType = str(m.get("mimeType"), "image/jpeg");
            if (!base64Data.isBlank()) {
                result.add(Map.of("base64Data", base64Data, "mimeType", mimeType));
            }
        }
        return result;
    }

    private String str(Object value, String defaultValue) {
        if (value == null) return defaultValue;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? defaultValue : s;
    }

    private String strKeep(Object value, String defaultValue) {
        if (value == null) return defaultValue;
        String s = String.valueOf(value);
        return s.isEmpty() ? defaultValue : s;
    }

    private boolean bool(Object value, boolean defaultValue) {
        if (value == null) return defaultValue;
        if (value instanceof Boolean b) return b;
        String raw = String.valueOf(value).trim();
        if (raw.isEmpty()) return defaultValue;
        return "true".equalsIgnoreCase(raw) || "1".equals(raw) || "yes".equalsIgnoreCase(raw);
    }

    private String truncate(String text, int maxChars) {
        if (text == null) return "";
        return text.length() > maxChars ? text.substring(0, maxChars) : text;
    }

    private String truncateMiddle(String text, int maxChars) {
        String value = String.valueOf(text == null ? "" : text);
        int limit = Math.max(1000, maxChars);
        if (value.length() <= limit) return value;
        int head = (int) Math.floor(limit * 0.65);
        int tail = Math.max(200, limit - head - 28);
        String left = value.substring(0, Math.min(head, value.length()));
        String right = value.substring(Math.max(0, value.length() - tail));
        return left + "\n...[TRIMMED_FOR_CODE_STREAM]...\n" + right;
    }

    private int estimateTokens(String text) {
        String value = String.valueOf(text == null ? "" : text);
        if (value.isBlank()) return 0;
        return Math.max(1, (int) Math.ceil(value.length() / 4.0));
    }

    private int estimateTokensByChars(int chars) {
        if (chars <= 0) return 0;
        return Math.max(1, (int) Math.ceil(chars / 4.0));
    }

    private record ModelPrice(double inputUsdPer1k, double outputUsdPer1k) {
    }

    private ModelPrice resolveModelPrice(String modelName) {
        String model = String.valueOf(modelName == null ? "" : modelName).toLowerCase();
        if (model.contains("flash")) {
            return new ModelPrice(
                    Math.max(0.0, aiCodeStreamCostFlashInputUsdPer1k),
                    Math.max(0.0, aiCodeStreamCostFlashOutputUsdPer1k));
        }
        if (model.contains("pro")) {
            return new ModelPrice(
                    Math.max(0.0, aiCodeStreamCostProInputUsdPer1k),
                    Math.max(0.0, aiCodeStreamCostProOutputUsdPer1k));
        }
        return new ModelPrice(
                Math.max(0.0, aiCodeStreamCostDefaultInputUsdPer1k),
                Math.max(0.0, aiCodeStreamCostDefaultOutputUsdPer1k));
    }

    private Map<String, Object> buildUsageInfoForSse(String modelName, int promptTokens, int completionTokens) {
        int inTokens = Math.max(0, promptTokens);
        int outTokens = Math.max(0, completionTokens);
        ModelPrice modelPrice = resolveModelPrice(modelName);

        double estimatedCostUsd = 0.0;
        if (aiCodeStreamCostEnabled) {
            estimatedCostUsd = (inTokens / 1000.0) * modelPrice.inputUsdPer1k
                    + (outTokens / 1000.0) * modelPrice.outputUsdPer1k;
        }

        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("enabled", aiCodeStreamCostEnabled);
        usage.put("model", String.valueOf(modelName == null ? "" : modelName));
        usage.put("promptTokens", inTokens);
        usage.put("completionTokens", outTokens);
        usage.put("totalTokens", inTokens + outTokens);
        usage.put("priceInputUsdPer1k", modelPrice.inputUsdPer1k);
        usage.put("priceOutputUsdPer1k", modelPrice.outputUsdPer1k);
        usage.put("estimatedCostUsd", Math.round(estimatedCostUsd * 1_000_000d) / 1_000_000d);
        usage.put("currency", "USD");
        return usage;
    }

    private String resolveDefaultStreamingModel() {
        if (aiCodeStreamDefaultStreamingModel != null && !aiCodeStreamDefaultStreamingModel.isBlank()) {
            return aiCodeStreamDefaultStreamingModel.trim();
        }
        if (aiCodeStreamLegacyStreamingModel != null && !aiCodeStreamLegacyStreamingModel.isBlank()) {
            return aiCodeStreamLegacyStreamingModel.trim();
        }
        return "gemini-2.5-pro";
    }

    private String resolveSimpleStreamingModel() {
        if (aiCodeStreamRoutingSimpleModel != null && !aiCodeStreamRoutingSimpleModel.isBlank()) {
            return aiCodeStreamRoutingSimpleModel.trim();
        }
        return "gemini-2.5-flash";
    }

    private String routeModel(String messageText, String codeContext, String contextType, String responseMode, String modelOverride) {
        if (modelOverride != null && !modelOverride.isBlank()) return modelOverride.trim();
        if (!aiCodeStreamRoutingEnabled) return resolveDefaultStreamingModel();

        String defaultModel = resolveDefaultStreamingModel();
        String simpleModel = resolveSimpleStreamingModel();
        if (simpleModel.isBlank() || simpleModel.equalsIgnoreCase(defaultModel)) {
            return defaultModel;
        }

        boolean isAnalyzeMode = !"edit".equalsIgnoreCase(responseMode);
        boolean isEditMode = "edit".equalsIgnoreCase(responseMode);
        boolean isMenuContext = isMenuJsonContext(contextType);
        int totalChars = (messageText == null ? 0 : messageText.length())
                + (codeContext == null ? 0 : codeContext.length());

        // Menu JSON edit ưu tiên model mặc định để giảm retry/fallback nhiều vòng.
        if (isMenuContext && isEditMode) {
            return defaultModel;
        }

        if (aiCodeStreamRoutingForceSimpleFirst
                && totalChars <= Math.max(8000, aiCodeStreamRoutingSimpleFirstMaxChars)) {
            logger.debug("ApiSpringController: ai-code-stream force simple-first model={} totalChars={}", simpleModel, totalChars);
            return simpleModel;
        }

        if (isEditMode && aiCodeStreamRoutingPreferSimpleForEdit
                && totalChars <= Math.max(4000, aiCodeStreamRoutingEditSimpleMaxChars)) {
            logger.debug("ApiSpringController: ai-code-stream cost-first route to simple model={} mode=edit totalChars={}",
                    simpleModel, totalChars);
            return simpleModel;
        }

        if (isAnalyzeMode && totalChars < Math.max(2000, aiCodeStreamRoutingComplexThresholdChars)) {
            logger.debug("ApiSpringController: ai-code-stream route to simple model={} totalChars={}", simpleModel, totalChars);
            return simpleModel;
        }

        return defaultModel;
    }

    private String[] buildCodingPromptParts(String message, String currentCode, String language,
            String contextType, String responseMode, Object attachmentsRaw,
            boolean largeStructuredEditMode, String baseRef, int baseChars) {
        String full = buildCodingPrompt(message, currentCode, language, contextType, responseMode,
                attachmentsRaw, largeStructuredEditMode, baseRef, baseChars);
        int idx = full.lastIndexOf("\n## YÊU CẦU\n");
        if (idx >= 0) {
            String systemPart = full.substring(0, idx).trim();
            String userPart = full.substring(idx + "\n## YÊU CẦU\n".length()).trim();
            return new String[] { systemPart, userPart };
        }
        return new String[] { full, "" };
    }

    private String jsonOf(Object... keyValues) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            m.put(String.valueOf(keyValues[i]), keyValues[i + 1]);
        }
        try {
            return objectMapper.writeValueAsString(m);
        } catch (Exception e) {
            return "{}";
        }
    }

    private void enrichModelDecisionMetadata(Map<String, Object> payload, String fallbackModel) {
        if (payload == null) return;
        String model = String.valueOf(payload.getOrDefault("model", fallbackModel == null ? "" : fallbackModel)).trim();
        if (!model.isBlank()) {
            payload.putIfAbsent("model", model);
        }

        String stage = String.valueOf(payload.getOrDefault("stage", "")).trim();
        String status = String.valueOf(payload.getOrDefault("status", "")).trim();
        String message = String.valueOf(payload.getOrDefault("message", "")).trim();

        String reasonCode = classifyModelDecisionReasonCode(message, stage, status);
        payload.putIfAbsent("modelDecisionReason", reasonCode);
        payload.putIfAbsent("reason_code", String.valueOf(payload.get("modelDecisionReason")));

        if (!payload.containsKey("modelDecisionStep")) {
            if ("initial_route".equals(reasonCode) || "processing".equals(reasonCode)) {
                payload.put("modelDecisionStep", "primary");
            } else if ("completed".equals(reasonCode)) {
                payload.put("modelDecisionStep", "final");
            } else {
                payload.put("modelDecisionStep", "fallback");
            }
        }
        payload.putIfAbsent("decision_step", String.valueOf(payload.get("modelDecisionStep")));
    }

    private String classifyModelDecisionReasonCode(String message, String stage, String status) {
        String text = (String.valueOf(message == null ? "" : message)
                + " "
                + String.valueOf(stage == null ? "" : stage)
                + " "
                + String.valueOf(status == null ? "" : status)).toLowerCase();

        if (text.contains("rate") || text.contains("429") || text.contains("too many request")) return "rate_limit";
        if (text.contains("quota") || text.contains("limit reached")) return "quota_exceeded";
        if (text.contains("auth") || text.contains("token") || text.contains("401") || text.contains("403")) return "auth_failed";
        if (text.contains("payload") || text.contains("too large") || text.contains("context too large") || text.contains("exceed")) return "payload_too_large";
        if (text.contains("switch") || text.contains("fallback") || text.contains("rotate") || text.contains("chuy") || text.contains("model_switch")) return "model_switch";
        if (text.contains("error") || text.contains("failed")) return "provider_error";
        if (text.contains("auto_continue") || text.contains("continuing")) return "auto_continue";
        if (text.contains("complete") || text.contains("completed")) return "completed";
        if (text.contains("preparing") || text.contains("connecting")) return "initial_route";
        return "processing";
    }

    private void pruneBaseContentCache() {
        if (!aiCodeStreamBaseCacheEnabled || aiCodeBaseContentCache.isEmpty()) return;
        long now = System.currentTimeMillis();
        long ttlMs = TimeUnit.MINUTES.toMillis(Math.max(5, aiCodeStreamBaseCacheTtlMinutes));
        aiCodeBaseContentCache.entrySet().removeIf(entry -> now - entry.getValue().createdAtMs > ttlMs);
        if (aiCodeBaseContentCache.size() <= Math.max(4, aiCodeStreamMaxBaseCacheEntries)) return;
        aiCodeBaseContentCache.entrySet().stream()
                .sorted((a, b) -> Long.compare(a.getValue().createdAtMs, b.getValue().createdAtMs))
                .limit(aiCodeBaseContentCache.size() - Math.max(4, aiCodeStreamMaxBaseCacheEntries))
                .map(Map.Entry::getKey)
                .toList()
                .forEach(aiCodeBaseContentCache::remove);
    }

    private AiCodeBaseContentResolution resolveBaseContent(String appId, String requestedRef, String providedBaseContent,
            String currentCodeRaw) {
        if (!aiCodeStreamBaseCacheEnabled) {
            return new AiCodeBaseContentResolution("", "", 0);
        }

        String requested = requestedRef == null ? "" : requestedRef.trim();
        if (!providedBaseContent.isBlank()) {
            String clamped = truncate(providedBaseContent, Math.max(100000, aiCodeStreamMaxBaseContentChars));
            String ref = buildBaseRef(appId, clamped);
            aiCodeBaseContentCache.put(ref, new AiCodeBaseContentEntry(appId, clamped, System.currentTimeMillis()));
            return new AiCodeBaseContentResolution(ref, clamped, clamped.length());
        }

        if (!requested.isBlank()) {
            AiCodeBaseContentEntry existing = aiCodeBaseContentCache.get(requested);
            if (existing != null) {
                return new AiCodeBaseContentResolution(requested, existing.content, existing.content.length());
            }
        }

        int autoPromoteThreshold = Math.max(50000, aiCodeStreamBaseCacheAutoPromoteChars);
        if (!currentCodeRaw.isBlank() && currentCodeRaw.length() >= autoPromoteThreshold) {
            String clamped = truncate(currentCodeRaw, Math.max(100000, aiCodeStreamMaxBaseContentChars));
            String ref = buildBaseRef(appId, clamped);
            aiCodeBaseContentCache.put(ref, new AiCodeBaseContentEntry(appId, clamped, System.currentTimeMillis()));
            return new AiCodeBaseContentResolution(ref, clamped, clamped.length());
        }

        return new AiCodeBaseContentResolution("", "", 0);
    }

    private String buildBaseRef(String appId, String content) {
        String app = (appId == null || appId.isBlank()) ? "global" : appId.trim();
        return "base_" + app + "_" + sha256(content).substring(0, 24);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(String.valueOf(value).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            return Integer.toHexString(String.valueOf(value).hashCode());
        }
    }

    private record AiCodeBaseContentResolution(String baseRef, String baseContent, int baseContentChars) {
    }

    private record AiCodeBaseContentEntry(String appId, String content, long createdAtMs) {
    }

    private record CodeWindowContext(String code, int startLine, int endLine) {
    }

    private String materializeLargeEditResponse(String rawResponse, String baseContent) {
        ParsedTextEditPayload payload = parseTextEditPayload(rawResponse);
        if (payload == null || payload.textEdits.isEmpty()) {
            return rawResponse;
        }

        String result = baseContent == null ? "" : baseContent;
        int applied = 0;
        List<Map<String, Object>> appliedStats = new ArrayList<>();
        for (TextEditOp op : payload.textEdits) {
            if (op == null || op.find == null || op.find.isBlank()) {
                continue;
            }
            int idx = result.indexOf(op.find);
            if (idx < 0) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("applied", false);
                item.put("findChars", op.find.length());
                appliedStats.add(item);
                continue;
            }
            String before = result.substring(0, idx);
            String after = result.substring(idx + op.find.length());
            result = before + String.valueOf(op.replace == null ? "" : op.replace) + after;
            applied += 1;

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("applied", true);
            item.put("offset", idx);
            item.put("findChars", op.find.length());
            item.put("replaceChars", op.replace == null ? 0 : op.replace.length());
            appliedStats.add(item);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", payload.summary == null ? "" : payload.summary);
        out.put("code", result);
        out.put("changes", payload.changes == null ? List.of() : payload.changes);

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("mode", "large-structured-edits");
        meta.put("requestedEdits", payload.textEdits.size());
        meta.put("appliedEdits", applied);
        meta.put("stats", appliedStats);
        out.put("meta", meta);

        try {
            return objectMapper.writeValueAsString(out);
        } catch (Exception ex) {
            return rawResponse;
        }
    }

    private ParsedTextEditPayload parseTextEditPayload(String raw) {
        String normalized = String.valueOf(raw == null ? "" : raw).trim();
        if (normalized.isBlank()) return null;
        if (normalized.startsWith("```json")) normalized = normalized.substring(7).trim();
        if (normalized.startsWith("```")) normalized = normalized.substring(3).trim();
        if (normalized.endsWith("```")) normalized = normalized.substring(0, normalized.length() - 3).trim();

        try {
            Map<?, ?> obj = objectMapper.readValue(normalized, Map.class);
            Object editsObj = obj.get("textEdits");
            List<TextEditOp> edits = new ArrayList<>();
            if (editsObj instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> map) {
                        String find = String.valueOf(map.get("find") == null ? "" : map.get("find"));
                        String replace = String.valueOf(map.get("replace") == null ? "" : map.get("replace"));
                        if (!find.isBlank()) {
                            edits.add(new TextEditOp(find, replace));
                        }
                    }
                }
            }

            List<String> changes = new ArrayList<>();
            Object changesObj = obj.get("changes");
            if (changesObj instanceof List<?> changeList) {
                for (Object item : changeList) {
                    if (item != null) {
                        changes.add(String.valueOf(item));
                    }
                }
            }

            String summary = String.valueOf(obj.get("summary") == null ? "" : obj.get("summary"));
            return new ParsedTextEditPayload(summary, changes, edits);
        } catch (Exception ex) {
            return null;
        }
    }

    private ParsedCodePayload parseCodePayload(String raw) {
        String normalized = String.valueOf(raw == null ? "" : raw).trim();
        if (normalized.isBlank()) return null;
        if (normalized.startsWith("```json")) normalized = normalized.substring(7).trim();
        if (normalized.startsWith("```")) normalized = normalized.substring(3).trim();
        if (normalized.endsWith("```")) normalized = normalized.substring(0, normalized.length() - 3).trim();

        try {
            Map<?, ?> obj = objectMapper.readValue(normalized, Map.class);
            String summary = String.valueOf(obj.get("summary") == null ? "" : obj.get("summary"));
            String code = String.valueOf(obj.get("code") == null ? "" : obj.get("code"));
            List<String> changes = new ArrayList<>();
            Object changesObj = obj.get("changes");
            if (changesObj instanceof List<?> changeList) {
                for (Object item : changeList) {
                    if (item != null) {
                        changes.add(String.valueOf(item));
                    }
                }
            }
            return new ParsedCodePayload(summary, code, changes);
        } catch (Exception ex) {
            return null;
        }
    }

    private record TextEditOp(String find, String replace) {
    }

    private record SearchReplaceBlock(String search, String replace) {
    }

    private record ParsedTextEditPayload(String summary, List<String> changes, List<TextEditOp> textEdits) {
    }

    private record ParsedCodePayload(String summary, String code, List<String> changes) {
    }

    public ResponseEntity<?> handleApiRequest(
            HttpServletRequest request,
            jakarta.servlet.http.HttpServletResponse servletResponse,
            @RequestHeader Map<String, String> headers,
            @RequestParam(required = false) Map<String, String> queryParams,
            @RequestBody(required = false) String requestBody // Body có thể là JSON
    ) {
        // Log đầu vào
        logger.info("[API IN] {} {} IP={} UA={} headers={} body={}", request.getMethod(), request.getRequestURI(),
                request.getRemoteAddr(), request.getHeader("User-Agent"), headers, requestBody);
        Map<String, String> lowerCaseHeaders = new HashMap<>();
        if (headers != null) {
            headers.forEach((key, value) -> lowerCaseHeaders.put(key.toLowerCase(), value));
        }

        String httpMethod = request.getMethod();
        Object rawAttr = request.getAttribute("cleanedUri");
        String rawPath = (rawAttr != null) ? rawAttr.toString() : request.getRequestURI();
        String effectivePath = rawPath;
        String csrfToken = lowerCaseHeaders.get("x-csrf-token");
        String refreshTokenHeader = lowerCaseHeaders.get("x-refresh-token");

        StandardResponse response = new StandardResponse();
        response.set("requestId", UUID.randomUUID().toString());
        response.setIsApi(true); // Đây là phản hồi API

        Map<String, Object> params = new HashMap<>(queryParams); // Khởi tạo params với query parameters
        if ("POST".equalsIgnoreCase(httpMethod) || "PUT".equalsIgnoreCase(httpMethod)) {
            String contentType = lowerCaseHeaders.getOrDefault("content-type", "");
            if (requestBody != null && !requestBody.isEmpty()) {
                if (contentType.contains("application/json")) {
                    try {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> typedParams = (Map<String, Object>) objectMapper.readValue(requestBody, Map.class);
                        params.putAll(typedParams);
                        logger.debug("✅ Đã parse JSON body: {}", params);
                    } catch (IOException e) {
                        logger.error("❌ Lỗi parse JSON body trong ApiSpringController: {}", e.getMessage(), e);
                        response.set("code", 400); // Bad Request
                        response.set("message", "Invalid JSON format in request body.");
                        logger.info("[API OUT] {} {} status=400 message=Invalid JSON format", request.getMethod(),
                                request.getRequestURI());
                        return buildResponseEntity(response); // Trả về lỗi JSON
                    }
                } else {
                    for (String line : requestBody.split("&")) {
                        String[] kv = line.split("=", 2);
                        if (kv.length == 2) {
                            params.put(kv[0], kv[1]);
                        }
                    }
                    logger.debug("✅ Đã parse form body: {}", params);
                }
            }
        }

        if (lowerCaseHeaders != null) {
            for (Map.Entry<String, String> entry : lowerCaseHeaders.entrySet()) {
                if (entry.getKey().startsWith("csm-")) {
                    params.put(entry.getKey(), entry.getValue());
                }
            }
        }
        if (csrfToken != null) {
            params.put("x-csrf-token", csrfToken);
        }
        if (refreshTokenHeader != null && !refreshTokenHeader.isBlank()) {
            params.put("refreshToken", refreshTokenHeader);
        } else if (request.getCookies() != null) {
            for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
                if ("refreshToken".equals(cookie.getName())) {
                    params.put("refreshToken", cookie.getValue());
                    break;
                }
            }
        }
        logger.debug("✅ Tham số {} với phương thức {}", params, httpMethod);

        // CRM multi-tenant guard: force app scoping by authenticated user context.
        if (isCrmPath(effectivePath)) {
            if (!secureAndNormalizeCrmParams(response, params, effectivePath, httpMethod)) {
                logger.info("[API OUT] {} {} status={} response={}", request.getMethod(), request.getRequestURI(),
                        response.get("code"), response);
                return buildResponseEntity(response);
            }
        }

        int statusCode = 200;
        try {
            // Chuyển logic switch từ ApiController.handleRequestByPath vào đây
            switch (effectivePath) {
                case "/create-default-data":
                    initHandler.handleCreateDefaultData(response);
                    break;
                case "/user-info":
                    authHandler.handleUserInfo(response, params);
                    break;
                case "/role-list":
                    roleHandler.handleRoleList(response, params);
                    break;
                case "/role-item":
                    roleHandler.handleRoleItem(response, httpMethod, params);
                    break;
                case "/role-menu":
                    roleHandler.handleRoleMenu(response);
                    break;
                case "/menu-by-role-id":
                    menuHandler.handleMenuByRoleId(response, params);
                    break;
                case "/menu-list":
                    menuHandler.handleMenuList(response);
                    break;
                case "/menu-item":
                    menuHandler.handleMenuItem(response, httpMethod, params);
                    break;
                case "/notifications":
                    homeHandler.handleNotifications(response);
                    break;
                case "/home":
                    homeHandler.handleHome(response);
                    break;
                case "/home/pie":
                    homeHandler.handleHomePie(response);
                    break;
                case "/home/line":
                    homeHandler.handleHomeLine(response, params);
                    break;
                case "/home/googlebot":
                    homeHandler.handleGoogleBotStats(response, params);
                    break;
                case "/home/googlebot/delete":
                    homeHandler.handleGoogleBotDelete(response, params);
                    break;
                case "/facebook/post":
                    handleFacebookPost(response, params);
                    break;
                case "/facebook/post-with-images":
                    handleFacebookPostWithImages(response, params);
                    break;
                case "/facebook/exchange-token":
                    handleFacebookExchangeToken(response, params);
                    break;
                case "/facebook/pages":
                    handleFacebookPages(response, params);
                    break;
                case "/facebook/me":
                    handleFacebookMe(response, params);
                    break;
                case "/facebook/ads/campaign": {
                    params.put("platform", "facebook_ads");
                    if (!params.containsKey("adData")) {
                        Map<String, Object> adData = new HashMap<>(params);
                        params.put("adData", adData);
                    }
                    crmHandler.handleCreateAd(response, params);
                    break;
                }
                case "/google/ads/campaign": {
                    params.put("platform", "google_ads");
                    if (!params.containsKey("adData")) {
                        Map<String, Object> adData = new HashMap<>(params);
                        params.put("adData", adData);
                    }
                    crmHandler.handleCreateAd(response, params);
                    break;
                }
                case "/login":
                    params.put("_servlet_response", servletResponse);
                    params.put("_host", request.getServerName());
                    params.put("_origin", lowerCaseHeaders.getOrDefault("origin", ""));
                    params.put("_referer", lowerCaseHeaders.getOrDefault("referer", ""));
                    params.put("_user_agent", lowerCaseHeaders.getOrDefault("user-agent", ""));
                    params.put("_client_ip", getClientIp(request, lowerCaseHeaders));
                    authHandler.handleLogin(response, params);
                    break;
                case "/logout":
                    // Clear refreshToken and CSRF cookies by setting them with max age 0
                    jakarta.servlet.http.Cookie refreshTokenCookie = new jakarta.servlet.http.Cookie("refreshToken",
                            "");
                    refreshTokenCookie.setMaxAge(0);
                    refreshTokenCookie.setPath("/");
                    refreshTokenCookie.setHttpOnly(true);
                    servletResponse.addCookie(refreshTokenCookie);

                    jakarta.servlet.http.Cookie csrfCookie = new jakarta.servlet.http.Cookie("CSRF-TOKEN", "");
                    csrfCookie.setMaxAge(0);
                    csrfCookie.setPath("/");
                    servletResponse.addCookie(csrfCookie);

                    authHandler.handleLogout(response, params);
                    break;
                case "/refresh-token":
                    params.put("_servlet_response", servletResponse);
                    params.put("_host", request.getServerName());
                    params.put("_origin", lowerCaseHeaders.getOrDefault("origin", ""));
                    params.put("_referer", lowerCaseHeaders.getOrDefault("referer", ""));
                    params.put("_user_agent", lowerCaseHeaders.getOrDefault("user-agent", ""));
                    params.put("_client_ip", getClientIp(request, lowerCaseHeaders));
                    authHandler.handleRefreshToken(response, params);
                    break;
                case "/get-async-routes":
                    authHandler.handleGetAsyncRoutes(response, params);
                    break;
                case "/seo":
                    SeoHandler.handleSeo(response, params);
                    break;
                case "/restoredb":
                    tableHandler.restoreDb(response, params);
                    break;
                case "/backupdb":
                    tableHandler.backupDb(response, params);
                    break;
                case "/migrateKeys":
                    tableHandler.migrateKeys(response, params);
                    break;
                case "/create-table":
                    tableHandler.handleCreateTable(response, params);
                    break;
                case "/drop-table":
                    tableHandler.handleDropTable(response, params);
                    break;
                case "/get-table-data":
                    tableHandler.handleGetTableData(response, params);
                    break;
                case "/update-table-data":
                    tableHandler.handleUpdateTableData(response, params);
                    break;
                case "/bulk-update-table-data":
                    tableHandler.handleBulkUpdateTableData(response, params);
                    break;
                case "/update-table-data-index":
                    tableHandler.handleIndexExistingRecords(response, params);
                    break;
                case "/ai-generate-seo-content":
                    getObjectFromAI(response, params);
                    break;
                case "/aiAssistant-chat-stream":
                    handleAiAssistantChatStream(response, params);
                    break;
                case "/ai/menu-merge":
                    handleAiMenuMerge(response, params);
                    break;
                case "/register":
                    authHandler.handleRegisterUser(response, params);
                    break;
                case "/create-sub-user":
                    authHandler.handleCreateSubUser(response, params);
                    break;
                case "/scrape-web": // <-- THÊM ENDPOINT MỚI CHO SCRAPING
                    handleWebScrape(response, params);
                    break;
                case "/execute-js-on-page": // <-- THÊM ENDPOINT MỚI CHO THỰC THI JS
                    handleExecuteJsOnPage(response, params);
                    break;
                case "/indexgoogle": // <-- THÊM ENDPOINT MỚI CHO GOOGLE INDEX API
                    handleGoogleIndexing(response, params);
                    break;
                case "/chat-history":
                    handleChatHistory(response, params);
                    break;
                case "/chat-history-guest":
                    handleChatHistoryGuest(response, params);
                    break;
                case "/chat-history-app":
                    handleChatHistoryApp(response, params);
                    break;
                case "/apps-list":
                    handleGetAppsList(response, params);
                    break;
                case "/chat-guests-list":
                    handleChatGuestsList(response, params);
                    break;
                case "/chat-mark-read":
                    handleChatMarkRead(response, params);
                    break;
                case "/chat-mark-all-read":
                    handleChatMarkAllRead(response, params);
                    break;
                case "/chat-delete-message":
                    handleChatDeleteMessage(response, params);
                    break;
                // ========== CRM APIs ==========
                case "/crm/customer":
                    if ("POST".equalsIgnoreCase(httpMethod) || "PUT".equalsIgnoreCase(httpMethod)) {
                        crmHandler.handleCreateOrUpdateCustomer(response, params);
                    } else if ("GET".equalsIgnoreCase(httpMethod)) {
                        // GET single customer by phone
                        crmHandler.handleGetCustomerDetail(response, params);
                    }
                    break;
                case "/crm/customers":
                    crmHandler.handleGetCustomers(response, params);
                    break;
                case "/crm/customer/assign":
                    crmHandler.handleAssignCustomer(response, params);
                    break;
                case "/crm/customer/status":
                    crmHandler.handleUpdateCustomerStatus(response, params);
                    break;
                case "/crm/customer/purchase":
                    crmHandler.handleAddPurchase(response, params);
                    break;
                case "/crm/customer/contact":
                    crmHandler.handleAddContactHistory(response, params);
                    break;
                case "/crm/birthdays":
                    crmHandler.handleGetUpcomingBirthdays(response, params);
                    break;
                case "/crm/stats":
                    crmHandler.handleGetCRMStats(response, params);
                    break;
                case "/crm/website-stats":
                    crmHandler.handleGetWebsiteStats(response, params);
                    break;
                case "/crm/ads-stats":
                    crmHandler.handleGetAdsStats(response, params);
                    break;
                case "/crm/ads":
                    if ("POST".equalsIgnoreCase(httpMethod)) {
                        crmHandler.handleCreateAd(response, params);
                    } else {
                        crmHandler.handleGetAds(response, params);
                    }
                    break;
                case "/crm/analytics":
                    crmHandler.handleGetAnalytics(response, params);
                    break;
                case "/crm/insights":
                    crmHandler.handleGetAIInsights(response, params);
                    break;
                default:
                    response.set("message", "Unsupported API path: " + effectivePath);
                    response.set("code", 404);
                    break;
            }
        } catch (Exception e) {
            logger.error("❌ Lỗi xử lý API cho đường dẫn {}: {}", effectivePath, e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Internal server error: " + e.getMessage());
        }

        Object respCode = response.get("code");
        if (respCode instanceof Integer)
            statusCode = (Integer) respCode;
        logger.info("[API OUT] {} {} status={} response={}", request.getMethod(), request.getRequestURI(), statusCode,
                response);
        return buildResponseEntity(response);
    }

    private boolean isCrmPath(String path) {
        return path != null && path.startsWith("/crm/");
    }

    private boolean isGuestCrmLeadCapturePath(String path, String httpMethod) {
        if (path == null || httpMethod == null) {
            return false;
        }
        return "/crm/customer".equals(path)
                && ("POST".equalsIgnoreCase(httpMethod) || "PUT".equalsIgnoreCase(httpMethod));
    }

    private static class UserAuthContext {
        String principalId;
        String appId;
        boolean dev;
        List<String> roles = new ArrayList<>();
        boolean authenticated;
    }

    private UserAuthContext extractUserAuthContext() {
        UserAuthContext context = new UserAuthContext();
        org.springframework.security.core.Authentication authentication =
                org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()
                || authentication.getPrincipal() == null
                || "anonymousUser".equals(authentication.getPrincipal())) {
            context.authenticated = false;
            return context;
        }

        context.authenticated = true;
        context.principalId = String.valueOf(authentication.getName() == null ? "" : authentication.getName()).trim();
        if (context.principalId.isEmpty()) {
            context.principalId = "unknown";
        }
        Object principal = authentication.getPrincipal();

        if (principal instanceof net.phanmemmottrieu.model.User) {
            net.phanmemmottrieu.model.User user = (net.phanmemmottrieu.model.User) principal;
            context.appId = user.getAppId();
            context.dev = user.getDev() != null && user.getDev();
            if (user.getPermissions() != null) {
                context.roles = user.getPermissions();
            }
        } else if (principal instanceof Map<?, ?> principalMap) {
            Object appObj = principalMap.get("app_id");
            if (appObj instanceof String) {
                context.appId = (String) appObj;
            }

            Object devObj = principalMap.get("dev");
            context.dev = devObj instanceof Boolean && (Boolean) devObj;

            Object rolesObj = principalMap.get("roles");
            if (rolesObj instanceof List<?>) {
                for (Object roleObj : (List<?>) rolesObj) {
                    if (roleObj instanceof String role) {
                        context.roles.add(role);
                    }
                }
            }
        }

        return context;
    }

    private boolean isCsmAdmin(UserAuthContext context) {
        if (context == null) {
            return false;
        }
        boolean isAdminRole = context.roles != null && context.roles.contains("admin");
        return "csm".equalsIgnoreCase(context.appId) && (context.dev || isAdminRole);
    }

    private boolean hasDevPrivilege(UserAuthContext context) {
        if (context == null || !context.authenticated) {
            return false;
        }
        if (context.dev) {
            return true;
        }
        return context.roles != null && context.roles.stream().anyMatch(role -> "dev".equalsIgnoreCase(role));
    }

    private String firstNonBlankString(Object... values) {
        if (values == null) {
            return null;
        }
        for (Object value : values) {
            if (value instanceof String) {
                String text = ((String) value).trim();
                if (!text.isEmpty()) {
                    return text;
                }
            }
        }
        return null;
    }

    private String extractPromptAsString(Map<String, Object> params) {
        if (params == null) {
            return null;
        }
        Object promptValue = params.get("prompt");
        if (promptValue == null) {
            return null;
        }
        if (promptValue instanceof String) {
            return (String) promptValue;
        }

        // Accept structured payloads and serialize them to JSON so AI receives full context.
        if (promptValue instanceof Map<?, ?> || promptValue instanceof List<?>) {
            try {
                return objectMapper.writeValueAsString(promptValue);
            } catch (Exception e) {
                logger.warn("Failed to serialize non-string prompt payload, fallback to toString(): {}", e.getMessage());
                return String.valueOf(promptValue);
            }
        }

        return String.valueOf(promptValue);
    }

    @SuppressWarnings("unchecked")
    private String extractTaskTypeFromPromptJson(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            return null;
        }
        try {
            Map<String, Object> parsed = objectMapper.readValue(prompt, Map.class);
            Object directTaskType = parsed.get("taskType");
            if (directTaskType instanceof String && !((String) directTaskType).isBlank()) {
                return ((String) directTaskType).trim();
            }

            Object currentTaskObj = parsed.get("current_task");
            if (currentTaskObj instanceof Map<?, ?> currentTask) {
                Object taskTypeObj = ((Map<String, Object>) currentTask).get("task_type");
                if (taskTypeObj instanceof String && !((String) taskTypeObj).isBlank()) {
                    return ((String) taskTypeObj).trim();
                }
            }
        } catch (Exception ignored) {
            // Prompt may be plain text; ignore parse errors.
        }
        return null;
    }

    /**
     * Extract the human-readable requirement text from the prompt JSON.
     * Looks in current_task.requirement_text first, then app_context.requirement_text.
     * Falls back to a short prefix of the raw prompt if not JSON.
     */
    @SuppressWarnings("unchecked")
    private String extractRequestTextFromPrompt(String prompt) {
        if (prompt == null || prompt.isBlank()) return "";
        try {
            Map<String, Object> parsed = objectMapper.readValue(prompt, Map.class);
            Object currentTask = parsed.get("current_task");
            if (currentTask instanceof Map) {
                Object req = ((Map<String, Object>) currentTask).get("requirement_text");
                if (req instanceof String s && !s.isBlank()) return s.trim();
            }
            Object appCtx = parsed.get("app_context");
            if (appCtx instanceof Map) {
                Object req = ((Map<String, Object>) appCtx).get("requirement_text");
                if (req instanceof String s && !s.isBlank()) return s.trim();
            }
        } catch (Exception ignored) {}
        // Fallback: use first 300 chars of raw prompt
        return prompt.length() > 300 ? prompt.substring(0, 300) : prompt;
    }

    private boolean shouldExposeRoutingDebug(Map<String, Object> params) {
        boolean requested = (params != null && Boolean.TRUE.equals(params.get("includeRoutingDebug")))
                || "true".equalsIgnoreCase(String.valueOf(params != null ? params.get("includeRoutingDebug") : null));
        if (!requested) {
            return false;
        }
        return hasDevPrivilege(extractUserAuthContext());
    }

    private boolean secureAndNormalizeCrmParams(StandardResponse response, Map<String, Object> params, String path,
            String httpMethod) {
        if (isGuestCrmLeadCapturePath(path, httpMethod)) {
            String requestedAppId = firstNonBlankString(params.get("appId"), params.get("app_id"));
            if (requestedAppId == null) {
                response.set("code", 400);
                response.set("success", false);
                response.set("message", "appId is required for guest CRM lead capture");
                return false;
            }

            params.put("appId", requestedAppId);
            params.put("app_id", requestedAppId);
            return true;
        }

        UserAuthContext context = extractUserAuthContext();
        if (!context.authenticated) {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Not authenticated");
            return false;
        }

        String userAppId = firstNonBlankString(context.appId);
        String requestedAppId = firstNonBlankString(params.get("appId"), params.get("app_id"));
        boolean csmAdmin = isCsmAdmin(context);

        if (!csmAdmin) {
            if (userAppId == null) {
                response.set("code", 403);
                response.set("success", false);
                response.set("message", "User app scope is missing");
                return false;
            }
            if (requestedAppId != null && !requestedAppId.equals(userAppId)) {
                logger.warn("🚫 CRM cross-app access denied: path={}, userAppId={}, requestedAppId={}",
                        path, userAppId, requestedAppId);
                response.set("code", 403);
                response.set("success", false);
                response.set("message", "Forbidden: cannot access CRM data of another app");
                return false;
            }

            params.put("appId", userAppId);
            params.put("app_id", userAppId);
            return true;
        }

        String effectiveAppId = firstNonBlankString(requestedAppId, userAppId, "csm");
        params.put("appId", effectiveAppId);
        params.put("app_id", effectiveAppId);
        return true;
    }

    /**
     * Gửi prompt đến dịch vụ AI, nhận phản hồi và chuyển đổi thành đối tượng JSON
     * động.
     *
     * <p>
    /**
     * Phương thức này thực hiện chuỗi các hành động: gửi một prompt đã được định
     * dạng đến dịch vụ
     * AI, nhận về một chuỗi JSON thô, làm sạch chuỗi đó bằng cách loại bỏ các ký tự
     * markdown thừa, và
     * cuối cùng sử dụng ObjectMapper để phân tích cú pháp chuỗi JSON thành Map
     * động.
     *
     * @param response Đối tượng StandardResponse để thiết lập kết quả hoặc thông
     *                 báo lỗi.
     * @param params   Map chứa các tham số đầu vào, bao gồm "prompt".
     */
    /**
     * POST /ai/menu-merge
     *
     * Params:
     *   scenario   : "incremental_update" | "property_edit"
     *   old_json   : JSON string of the current (old) menu tree / node
     *   new_json   : JSON string of AI's proposed menu tree / node
     *
     * Returns MergeOutput: { mergedMenu, patchOps, added, edited, deleted }
     */
    private void handleAiMenuMerge(StandardResponse response, Map<String, Object> params) {
        String uiLang = resolveClientUiLanguage(params);
        try {
            String scenario = String.valueOf(params.getOrDefault("scenario", "incremental_update")).trim();
            String oldJson  = String.valueOf(params.getOrDefault("old_json",  "[]")).trim();
            String newJson  = String.valueOf(params.getOrDefault("new_json",  "[]")).trim();

            AiMenuMergeService.MergeOutput out;
            if ("property_edit".equals(scenario)) {
                out = aiMenuMergeService.mergeMenuNode(oldJson, newJson);
            } else {
                out = aiMenuMergeService.diffMergeTrees(oldJson, newJson);
            }

            response.set("code", 200);
            response.set("success", true);
            response.set("result", objectMapper.convertValue(out, Map.class));
        } catch (Exception e) {
            logger.error("handleAiMenuMerge error: {}", e.getMessage(), e);
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Hợp nhất menu thất bại: " + e.getMessage(),
                "Menu merge failed: " + e.getMessage(),
                "菜单合并失败：" + e.getMessage()));
        }
    }

    /**
     * Handle CodeMirror AI Assistant chat with streaming via Socket.IO
     * Sends streaming text chunks to client in real-time
     */
    private void handleAiAssistantChatStream(StandardResponse response, Map<String, Object> params) {
        try {
            UserAuthContext authCtx = extractUserAuthContext();
            String appId = String.valueOf(params.getOrDefault("appId", "")).trim();
            String message = String.valueOf(params.getOrDefault("message", "")).trim();
            String currentCode = String.valueOf(params.getOrDefault("currentCode", "")).trim();
            String language = String.valueOf(params.getOrDefault("language", "javascript")).trim();
            String uiLang = resolveClientUiLanguage(params);
            String contextType = String.valueOf(params.getOrDefault("contextType", "code")).trim();
            String taskType = String.valueOf(params.getOrDefault("taskType", "")).trim();
            String flowType = String.valueOf(params.getOrDefault("flowType", "")).trim();
            String pName = String.valueOf(params.getOrDefault("pName", "")).trim();
            Integer pType = parseNullableInteger(params.get("pType"));
            String rawResponseMode = String.valueOf(params.getOrDefault("responseMode", "")).trim();
            String detectedModeFromMessage = detectAiAssistantResponseModeFromMessage(message);
            String normalizedFlowType = normalizeAiAssistantFlowType(flowType, contextType, taskType);
            String effectiveContextType = "menu_manager".equals(normalizedFlowType) ? "menu_json" : "code";
            String effectiveTaskType = "menu_manager".equals(normalizedFlowType)
                ? (taskType == null || taskType.isBlank() ? "menu_design" : taskType)
                : "code_assistant";
            String responseMode = (isMenuAiAssistantFlow(effectiveContextType, effectiveTaskType)
                && rawResponseMode.isEmpty()
                && !"analyze".equalsIgnoreCase(detectedModeFromMessage))
                ? "edit"
                : normalizeAiAssistantResponseMode(params.get("responseMode"), message);
            message = stripAiAssistantModeDirective(message);
            List<Map<String, Object>> attachments = normalizeAiAssistantAttachments(params.get("attachments"));
            if (attachments == null) {
                attachments = new ArrayList<>();
            }
            logger.info(
                "AI Assistant chat request: appId={}, contextTypeRaw={}, taskTypeRaw={}, contextTypeEffective={}, taskTypeEffective={}, flowType={}, responseMode={}, attachmentsCount={}, attachments={} ",
                appId,
                contextType,
                taskType,
                effectiveContextType,
                effectiveTaskType,
                normalizedFlowType,
                responseMode,
                attachments == null ? 0 : attachments.size(),
                buildAiAssistantAttachmentRequestLogLine(attachments));
            
            if (message.isEmpty() && attachments.isEmpty()) {
                response.set("code", 200);
                response.set("success", false);
                response.set("message", uiTextByLang(
                    uiLang,
                    "Cần nhập tin nhắn hoặc đính kèm tệp",
                    "Message or attachment is required",
                    "需要输入消息或上传附件"));
                return;
            }

            if (appId.isEmpty()) {
                response.set("code", 200);
                response.set("success", false);
                response.set("message", uiTextByLang(
                    uiLang,
                    "Thiếu appId",
                    "appId is required",
                    "缺少 appId"));
                return;
            }

            String continuityScopeKey = buildAiAssistantContinuityScopeKey(effectiveContextType, language, pName, pType);
            String continuityMemory = trimAiAssistantContinuityMemory(
                aiAssistantGatewayService.loadAiAssistantConversationMemory(appId, continuityScopeKey));
            String aggregatedReusableMemory = trimAiAssistantContinuityMemory(
                aiConversationContextService.buildAggregatedContextWindow(
                    authCtx.principalId,
                    appId,
                    effectiveContextType,
                    pName,
                    pType));
            if (!aggregatedReusableMemory.isBlank()) {
                continuityMemory = continuityMemory.isBlank()
                    ? aggregatedReusableMemory
                    : (continuityMemory + "\n\n## SHARED_REUSE_MEMORY\n" + aggregatedReusableMemory);
            }
            List<String> pendingQuestions = aiAssistantGatewayService.loadAiAssistantPendingQuestions(appId, continuityScopeKey, 8);
            AiLocalOrchestrationService.OrchestrationResult orchestrationResult = AiLocalOrchestrationService.OrchestrationResult.disabled();

            // CHAINING Step 1: if enabled and total payload is very large, run chained distillation
            // to compress large config files via an extra AI Assistant API call before the final request.
            String chainedSchemaSummary = "";
            String chainedCodeSummary = "";
            int estimatedCharsBeforeChain = estimateTotalAiAssistantPayloadChars(
                attachments,
                message,
                currentCode,
                continuityMemory,
                aggregatedReusableMemory,
                "");
            if (aiAssistantMenuChainingEnabled
                && "menu_json".equals(effectiveContextType)
                && estimatedCharsBeforeChain > Math.max(150000, aiAssistantMenuChainingThresholdChars)) {
                try {
                    emitAiAssistantChatChunk(appId, Map.of(
                        "stage", "chaining_step1",
                        "message", uiTextByLang(
                            uiLang,
                            "Tải trọng quá lớn (" + estimatedCharsBeforeChain + " chars), bắt đầu Chaining Step 1: phân tích schema",
                            "Payload is very large (" + estimatedCharsBeforeChain + " chars), starting Chaining Step 1: schema analysis",
                            "负载过大（" + estimatedCharsBeforeChain + " chars），开始链式步骤 1：分析 schema"),
                        "responseMode", responseMode,
                        "status", "running"
                    ));
                    chainedSchemaSummary = runMenuChainingStep1(attachments, appId);
                    if (!chainedSchemaSummary.isBlank()) {
                        logger.info("AI Assistant chaining step1 completed: {} chars schema summary for appId={}", chainedSchemaSummary.length(), appId);
                        emitAiAssistantChatChunk(appId, Map.of(
                            "stage", "chaining_step1_done",
                            "message", uiTextByLang(
                                uiLang,
                                "Chaining Step 1 hoàn thành: " + chainedSchemaSummary.length() + " chars schema summary",
                                "Chaining Step 1 completed: " + chainedSchemaSummary.length() + " chars schema summary",
                                "链式步骤 1 已完成：" + chainedSchemaSummary.length() + " chars schema 摘要"),
                            "responseMode", responseMode,
                            "status", "running"
                        ));
                    }
                } catch (Exception chainEx) {
                    logger.warn("AI Assistant chaining step1 failed: {} — continuing without chained summary", chainEx.getMessage());
                }
            }

            if (aiAssistantCodeChainingEnabled
                && "code".equals(effectiveContextType)
                && currentCode != null
                && currentCode.length() > Math.max(120000, aiAssistantCodeChainingThresholdChars)) {
                try {
                    emitAiAssistantChatChunk(appId, Map.of(
                        "stage", "code_chaining_step1",
                        "message", uiTextByLang(
                            uiLang,
                            "Mã nguồn rất lớn (" + currentCode.length() + " chars), bắt đầu Code Chaining Step 1",
                            "Source code is very large (" + currentCode.length() + " chars), starting Code Chaining Step 1",
                            "源码过大（" + currentCode.length() + " chars），开始代码链式步骤 1"),
                        "responseMode", responseMode,
                        "status", "running"
                    ));
                    CodeChainingResult codeChainResult = runCodeChainingStep1(currentCode, message, language, appId, pName);
                    chainedCodeSummary = codeChainResult.summary;
                    if (!chainedCodeSummary.isBlank()) {
                        emitAiAssistantChatChunk(appId, Map.of(
                            "stage", "code_chaining_step1_done",
                            "message", uiTextByLang(
                                uiLang,
                                "Code Chaining Step 1 hoàn thành: "
                                    + chainedCodeSummary.length()
                                    + " chars"
                                    + (codeChainResult.cacheHit ? " (cache hit)" : "")
                                    + ", "
                                    + codeChainResult.elapsedMs
                                    + "ms",
                                "Code Chaining Step 1 completed: "
                                    + chainedCodeSummary.length()
                                    + " chars"
                                    + (codeChainResult.cacheHit ? " (cache hit)" : "")
                                    + ", "
                                    + codeChainResult.elapsedMs
                                    + "ms",
                                "代码链式步骤 1 已完成："
                                    + chainedCodeSummary.length()
                                    + " chars"
                                    + (codeChainResult.cacheHit ? "（命中缓存）" : "")
                                    + "，"
                                    + codeChainResult.elapsedMs
                                    + "ms"),
                            "cacheHit", codeChainResult.cacheHit,
                            "elapsedMs", codeChainResult.elapsedMs,
                            "promptChars", codeChainResult.promptChars,
                            "responseChars", codeChainResult.responseChars,
                            "fingerprint", codeChainResult.fingerprint,
                            "responseMode", responseMode,
                            "status", "running"
                        ));
                    }
                } catch (Exception codeChainEx) {
                    logger.warn("AI Assistant code chaining step1 failed: {} — continuing without code summary", codeChainEx.getMessage());
                }
            }

            String globalContext = buildMenuGlobalContext(
                appId,
                continuityScopeKey,
                effectiveContextType,
                effectiveTaskType,
                message,
                currentCode,
                attachments);
            // Merge chained schema summary into globalContext if available
            if (!chainedSchemaSummary.isBlank()) {
                globalContext = (globalContext.isBlank() ? "" : globalContext + "\n\n")
                    + "## CHAINING STEP 1 — Pre-analyzed Schema Summary\n"
                    + "The following was extracted from large config attachments in a prior AI call.\n"
                    + "Use this to understand the data structures without needing the raw full JSON.\n\n"
                    + chainedSchemaSummary;
            }
            if (!chainedCodeSummary.isBlank()) {
                globalContext = (globalContext.isBlank() ? "" : globalContext + "\n\n")
                    + "## CODE CHAINING STEP 1 — Large Editor File Summary\n"
                    + "This summary was generated from the full editor buffer to keep the final request within context budget.\n"
                    + "When conflict happens: prioritize ACTIVE FILE IN EDITOR content over this summary.\n\n"
                    + chainedCodeSummary;
            }

            try {
                orchestrationResult = aiLocalOrchestrationService.orchestrate(
                    appId,
                    message,
                    currentCode,
                    attachments,
                    effectiveContextType,
                    effectiveTaskType,
                    responseMode,
                    language);
                if (orchestrationResult.enabled && orchestrationResult.compressedContextBlock != null
                    && !orchestrationResult.compressedContextBlock.isBlank()) {
                    Map<String, Object> agenticPlanEvt = new java.util.LinkedHashMap<>();
                    agenticPlanEvt.put("stage", "agentic_plan");
                    agenticPlanEvt.put("message", uiTextByLang(
                        uiLang,
                        "Đã lập kế hoạch local-agentic và chạy local tools trước khi gọi model chính",
                        "Prepared local-agentic plan and executed local tools before final model call",
                        "已在最终模型调用前完成本地 Agent 计划与工具执行"));
                    agenticPlanEvt.put("responseMode", responseMode);
                    agenticPlanEvt.put("status", "running");
                    agenticPlanEvt.put("current", 1);
                    agenticPlanEvt.put("total", 3);
                    agenticPlanEvt.put("percent", 33);
                    agenticPlanEvt.put("compacted", orchestrationResult.savedChars > 0);
                    agenticPlanEvt.put("savedChars", orchestrationResult.savedChars);
                    agenticPlanEvt.put("charsBefore", orchestrationResult.totalCharsBefore);
                    agenticPlanEvt.put("charsAfter", orchestrationResult.totalCharsAfter);
                    agenticPlanEvt.put("routingTier", orchestrationResult.routingTier != null ? orchestrationResult.routingTier : "");
                    agenticPlanEvt.put("planStepCount", orchestrationResult.planSteps != null ? orchestrationResult.planSteps.size() : 0);
                    emitAiAssistantChatChunk(appId, agenticPlanEvt);

                    emitAiAssistantChatChunk(appId, Map.of(
                        "stage", "local_tool_invocation",
                        "message", uiTextByLang(
                            uiLang,
                            "Local tools đã nén context theo tầng để giảm token",
                            "Local tools compressed tiered context to reduce token usage",
                            "本地工具已按分层上下文进行压缩以减少 token"),
                        "responseMode", responseMode,
                        "status", "running",
                        "current", 2,
                        "total", 3,
                        "percent", 66,
                        "detail", "savedChars=" + orchestrationResult.savedChars
                            + ", routingTier=" + String.valueOf(orchestrationResult.routingTier == null ? "" : orchestrationResult.routingTier)
                            + ", preferredModel=" + String.valueOf(orchestrationResult.preferredModelHint == null ? "" : orchestrationResult.preferredModelHint)
                            + ", speculative=" + String.valueOf(orchestrationResult.speculativeOperation == null ? "none" : orchestrationResult.speculativeOperation)));

                    globalContext = (globalContext.isBlank() ? "" : globalContext + "\n\n")
                        + orchestrationResult.compressedContextBlock;

                    emitAiAssistantChatChunk(appId, Map.of(
                        "stage", "context_compression",
                        "message", uiTextByLang(
                            uiLang,
                            "Đã gắn compressed orchestration context vào prompt cuối",
                            "Attached compressed orchestration context to final prompt",
                            "已将压缩后的编排上下文加入最终提示"),
                        "responseMode", responseMode,
                        "status", "running",
                        "current", 3,
                        "total", 3,
                        "percent", 100));
                }
            } catch (Exception orchestrationEx) {
                logger.warn("AI Assistant local orchestration failed, continue with baseline flow: {}", orchestrationEx.getMessage());
            }

            List<Map<String, Object>> messages = buildAiAssistantChatMessages(appId, message, currentCode, language, effectiveContextType,
                effectiveTaskType, responseMode, attachments, continuityMemory, globalContext, pName, pType, continuityScopeKey, pendingQuestions);
            emitAiAssistantChatDebug(appId, buildAiAssistantDebugPayload(
                appId,
                message,
                currentCode,
                language,
                effectiveContextType,
                effectiveTaskType,
                responseMode,
                attachments,
                continuityMemory,
                globalContext,
                pName,
                pType,
                continuityScopeKey,
                pendingQuestions,
                messages));
            
            // Set up streaming via Socket.IO
            StringBuilder fullResponse = new StringBuilder();
            AtomicReference<String> lastDraftRef = new AtomicReference<>(currentCode == null ? "" : currentCode);
            AiAssistantGatewayService.ProgressListener streamListener = (progress) -> {
                String stage = String.valueOf(progress.getOrDefault("stage", ""));
                String chunk = String.valueOf(progress.getOrDefault("chunk", ""));
                if ("streaming".equals(stage) && !chunk.isEmpty()) {
                    fullResponse.append(chunk);
                }

                Map<String, Object> realtimePayload = new HashMap<>();
                realtimePayload.put("stage", stage);
                realtimePayload.put("message", String.valueOf(progress.getOrDefault("message", "")));
                realtimePayload.put("chunk", chunk);
                realtimePayload.put("responseMode", responseMode);

                Object current = progress.get("current");
                Object total = progress.get("total");
                Object percent = progress.get("percent");
                if (current != null) realtimePayload.put("current", current);
                if (total != null) realtimePayload.put("total", total);
                if (percent != null) realtimePayload.put("percent", percent);
                Object detail = progress.get("detail");
                Object detailKey = progress.get("detailKey");
                Object detailArgs = progress.get("detailArgs");
                Object orchestrationPhase = progress.get("orchestrationPhase");
                Object orchestrationPhaseKey = progress.get("orchestrationPhaseKey");
                Object overallPercent = progress.get("overallPercent");
                Object messageKey = progress.get("messageKey");
                Object messageArgs = progress.get("messageArgs");
                if (detail != null) realtimePayload.put("detail", detail);
                if (detailKey != null) realtimePayload.put("detailKey", detailKey);
                if (detailArgs != null) realtimePayload.put("detailArgs", detailArgs);
                if (orchestrationPhase != null) realtimePayload.put("orchestrationPhase", orchestrationPhase);
                if (orchestrationPhaseKey != null) realtimePayload.put("orchestrationPhaseKey", orchestrationPhaseKey);
                if (overallPercent != null) realtimePayload.put("overallPercent", overallPercent);
                if (messageKey != null) realtimePayload.put("messageKey", messageKey);
                if (messageArgs != null) realtimePayload.put("messageArgs", messageArgs);
                Object status = progress.get("status");
                if (status != null) realtimePayload.put("status", status);

                // Keep compatibility with legacy realtime editor payloads.
                Object draftText = progress.get("draftText");
                Object partialJson = progress.get("partialJson");
                Object previewJson = progress.get("previewJson");
                Object textEdits = progress.get("textEdits");
                Object lineRanges = progress.get("lineRanges");
                Object changedRanges = progress.get("changedRanges");
                Object patchOps = progress.get("patchOps");

                String realtimeDraft = extractRealtimeDraftText(progress);
                List<Map<String, Object>> generatedTextEdits = Collections.emptyList();
                if (!realtimeDraft.isBlank()) {
                    String previousDraft = String.valueOf(lastDraftRef.get() == null ? "" : lastDraftRef.get());
                    if (!realtimeDraft.equals(previousDraft)) {
                        generatedTextEdits = buildLineTextEdits(previousDraft, realtimeDraft);
                        lastDraftRef.set(realtimeDraft);
                    }
                }

                if (draftText != null) realtimePayload.put("draftText", draftText);
                if (partialJson != null) realtimePayload.put("partialJson", partialJson);
                if (previewJson != null) realtimePayload.put("previewJson", previewJson);
                if (textEdits != null) {
                    realtimePayload.put("textEdits", textEdits);
                } else if (!generatedTextEdits.isEmpty()) {
                    realtimePayload.put("textEdits", generatedTextEdits);
                }
                if (lineRanges != null) {
                    realtimePayload.put("lineRanges", lineRanges);
                }
                if (changedRanges != null) {
                    realtimePayload.put("changedRanges", changedRanges);
                }
                if (textEdits == null && lineRanges == null && changedRanges == null && !generatedTextEdits.isEmpty()) {
                    List<Map<String, Object>> ranges = convertTextEditsToLineRanges(generatedTextEdits);
                    if (!ranges.isEmpty()) {
                        realtimePayload.put("lineRanges", ranges);
                        realtimePayload.put("changedRanges", ranges);
                    }
                }
                if (patchOps != null) realtimePayload.put("patchOps", patchOps);

                boolean hasChunk = !chunk.isEmpty();
                boolean hasRealtimeDraft = draftText != null || partialJson != null || previewJson != null;
                boolean hasRealtimeEdits = textEdits != null || lineRanges != null || changedRanges != null || patchOps != null || !generatedTextEdits.isEmpty();
                boolean hasStatus = !stage.isEmpty()
                    || !String.valueOf(progress.getOrDefault("message", "")).isEmpty()
                    || current != null
                    || total != null
                    || percent != null
                    || status != null;
                if (hasChunk || hasRealtimeDraft || hasRealtimeEdits || hasStatus) {
                    emitAiAssistantChatChunk(appId, realtimePayload);
                }
            };

            String githubRaw = "";
            int estimatedPayloadChars = estimateTotalAiAssistantPayloadChars(
                attachments,
                message,
                currentCode,
                continuityMemory,
                aggregatedReusableMemory,
                globalContext);
            boolean directProviderRoute = shouldDirectProviderRouteForLargeMenu(
                effectiveContextType,
                effectiveTaskType,
                attachments,
                message,
                currentCode,
                estimatedPayloadChars);
            boolean menuGeminiFallbackDisabled = shouldDisableGeminiFallbackForMenu(effectiveContextType, effectiveTaskType);
            if (menuGeminiFallbackDisabled) {
                directProviderRoute = false;
            }
            boolean quickPrimaryProbeRoute = shouldQuickPrimaryProbeForMediumMenu(
                effectiveContextType,
                effectiveTaskType,
                estimatedPayloadChars);
            boolean skipPrimaryProbeForHugePayload = shouldSkipPrimaryProbeForHugeMenuPayload(estimatedPayloadChars);
            boolean forceGeminiFallback = false;
            boolean usedQuickPrimaryProbe = false;
            boolean usedDirectProviderRoute = false;
            boolean usedGeminiFallback = false;

            if (directProviderRoute) {
                usedDirectProviderRoute = true;
                if (aiAssistantMenuDirectProviderPrimaryProbeFirst && !skipPrimaryProbeForHugePayload) {
                    usedQuickPrimaryProbe = true;
                    emitAiAssistantChatChunk(appId, Map.of(
                        "stage", "large_menu_quick_primary_probe",
                        "modelDecisionStep", "primary",
                        "modelDecisionReason", "routing_simple_model",
                        "decision_step", "primary",
                        "reason_code", "routing_simple_model",
                        "message", uiTextByLang(
                            uiLang,
                            "Menu payload rất lớn, thử AI Assistant 1 lượt ngắn trước khi fallback",
                            "Menu payload is very large, trying a quick AI Assistant pass before fallback",
                            "菜单负载很大，先进行一次 AI Assistant 快速尝试再回退"),
                        "responseMode", responseMode,
                        "status", "running"
                    ));
                    String probePrompt = buildAiAssistantQuickProbePromptText(
                        message,
                        currentCode,
                        language,
                        effectiveContextType,
                        responseMode,
                        attachments,
                        continuityMemory,
                        globalContext,
                        pName,
                        pType,
                        continuityScopeKey,
                        pendingQuestions);
                    githubRaw = runPrimaryProbeWithTimeout(probePrompt, streamListener, appId, "large_menu_quick_primary_probe");
                    String probeText = extractAiResultText(githubRaw);
                    boolean probeLooksValid = isLikelyJsonPayload(probeText);
                    if (!probeText.isBlank() && probeLooksValid) {
                        fullResponse.append(probeText);
                        emitTextAsAiAssistantChunks(appId, probeText, responseMode, uiLang);
                    } else {
                        forceGeminiFallback = true;
                        logger.warn("AI Assistant stream: large-menu quick primary probe did not return valid menu JSON. Triggering immediate fallback.");
                        emitAiAssistantChatChunk(appId, Map.of(
                            "stage", "large_menu_probe_fallback_trigger",
                            "modelDecisionStep", "fallback",
                            "modelDecisionReason", "payload_too_large",
                            "decision_step", "fallback",
                            "reason_code", "payload_too_large",
                            "message", uiTextByLang(
                                uiLang,
                                "Quick probe không trả về JSON hợp lệ, chuyển fallback ngay",
                                "Quick probe did not return valid JSON, switching to fallback immediately",
                                "快速探测未返回有效 JSON，立即切换回退"),
                            "responseMode", responseMode,
                            "status", "running"
                        ));
                    }
                } else {
                    emitAiAssistantChatChunk(appId, Map.of(
                        "stage", "direct_provider_route",
                        "modelDecisionStep", "fallback",
                        "modelDecisionReason", "payload_too_large",
                        "decision_step", "fallback",
                        "reason_code", "payload_too_large",
                        "message", uiTextByLang(
                            uiLang,
                            skipPrimaryProbeForHugePayload
                                ? "Payload quá lớn, bỏ qua quick probe và route trực tiếp sang provider fallback"
                                : "Menu payload lớn, route trực tiếp sang provider fallback để tránh vòng lặp 429",
                            skipPrimaryProbeForHugePayload
                                ? "Payload is extremely large, skipping quick probe and routing directly to fallback provider"
                                : "Menu payload is large, routing directly to fallback provider to avoid repeated 429",
                            skipPrimaryProbeForHugePayload
                                ? "负载极大，跳过快速探测并直接路由到回退提供方"
                                : "菜单负载较大，直接路由到回退提供方以避免 429 循环"),
                        "responseMode", responseMode,
                        "status", "running"
                    ));
                    String directPrompt = buildAiAssistantChatPromptText(
                        message,
                        currentCode,
                        language,
                        effectiveContextType,
                        responseMode,
                        attachments,
                        continuityMemory,
                        globalContext,
                        pName,
                        pType,
                        continuityScopeKey,
                        pendingQuestions,
                        true);
                    githubRaw = this.aiProviderFactory.generateContent(directPrompt);
                    String directText = extractAiResultText(githubRaw);
                    if (!directText.isBlank()) {
                        fullResponse.append(directText);
                        emitTextAsAiAssistantChunks(appId, directText, responseMode, uiLang);
                    }
                }
            } else if (quickPrimaryProbeRoute) {
                usedQuickPrimaryProbe = true;
                emitAiAssistantChatChunk(appId, Map.of(
                    "stage", "quick_primary_probe",
                    "modelDecisionStep", "primary",
                    "modelDecisionReason", "routing_simple_model",
                    "decision_step", "primary",
                    "reason_code", "routing_simple_model",
                    "message", uiTextByLang(
                        uiLang,
                        "Menu payload trung bình-lớn, thử AI Assistant 1 lượt ngắn trước khi fallback",
                        "Menu payload is medium-large, trying a quick AI Assistant pass before fallback",
                        "菜单负载中到大，先进行一次 AI Assistant 快速尝试再回退"),
                    "responseMode", responseMode,
                    "status", "running"
                ));
                String probePrompt = buildAiAssistantQuickProbePromptText(
                    message,
                    currentCode,
                    language,
                    effectiveContextType,
                    responseMode,
                    attachments,
                    continuityMemory,
                    globalContext,
                    pName,
                    pType,
                    continuityScopeKey,
                    pendingQuestions);
                githubRaw = runPrimaryProbeWithTimeout(probePrompt, streamListener, appId, "quick_primary_probe");
                String probeText = extractAiResultText(githubRaw);
                boolean probeLooksValid = isLikelyJsonPayload(probeText);
                if (!probeText.isBlank() && probeLooksValid) {
                    fullResponse.append(probeText);
                    emitTextAsAiAssistantChunks(appId, probeText, responseMode, uiLang);
                } else {
                    forceGeminiFallback = true;
                    logger.warn("AI Assistant stream: quick primary probe did not return valid menu JSON. Triggering immediate fallback.");
                    emitAiAssistantChatChunk(appId, Map.of(
                        "stage", "quick_primary_probe_fallback_trigger",
                        "modelDecisionStep", "fallback",
                        "modelDecisionReason", "payload_too_large",
                        "decision_step", "fallback",
                        "reason_code", "payload_too_large",
                        "message", uiTextByLang(
                            uiLang,
                            "Quick probe không trả về JSON hợp lệ, chuyển fallback ngay",
                            "Quick probe did not return valid JSON, switching to fallback immediately",
                            "快速探测未返回有效 JSON，立即切换回退"),
                        "responseMode", responseMode,
                        "status", "running"
                    ));
                }
            } else {
                emitAiAssistantChatChunk(appId, Map.of(
                    "stage", "ai_assistant_route",
                    "modelDecisionStep", "primary",
                    "modelDecisionReason", "routing_default_model",
                    "decision_step", "primary",
                    "reason_code", "routing_default_model",
                    "message", uiTextByLang(
                        uiLang,
                        "Đang gọi trực tiếp AI Assistant API",
                        "Calling AI Assistant API directly",
                        "正在直接调用 AI Assistant API"),
                    "responseMode", responseMode,
                    "status", "running"
                ));
                githubRaw = aiAssistantGatewayService.chatWithStreamingMessages(messages, streamListener);
            }

            if (fullResponse.length() == 0) {
                String extractedFromGithub = extractAiResultText(githubRaw);
                if (!extractedFromGithub.isBlank()) {
                    fullResponse.append(extractedFromGithub);
                    emitTextAsAiAssistantChunks(appId, extractedFromGithub, responseMode, uiLang);
                }
            }

            boolean upstreamFallbackSignal = forceGeminiFallback || shouldFallbackToGemini(githubRaw);
            boolean forcedMenuFallbackOverride = shouldForceGeminiFallbackForMenuFailure(
                effectiveContextType,
                effectiveTaskType,
                githubRaw,
                upstreamFallbackSignal);
            boolean shouldGeminiFallback = upstreamFallbackSignal
                && (!menuGeminiFallbackDisabled || forcedMenuFallbackOverride);
            if (fullResponse.length() == 0 && shouldGeminiFallback) {
                usedGeminiFallback = true;
                boolean authFailure = isAuthFailureFromRawText(githubRaw);
                if (menuGeminiFallbackDisabled && forcedMenuFallbackOverride) {
                    logger.warn("AI Assistant stream: overriding disabled menu Gemini fallback due to upstream failure signals.");
                    emitAiAssistantChatChunk(appId, Map.of(
                        "stage", "menu_gemini_fallback_override",
                        "modelDecisionStep", "fallback",
                        "modelDecisionReason", "provider_error",
                        "decision_step", "fallback",
                        "reason_code", "provider_error",
                        "message", uiTextByLang(
                            uiLang,
                            "AI Assistant API đang lỗi hạ tầng/giới hạn, tạm bỏ chặn fallback để chuyển sang Gemini",
                            "AI Assistant API has infrastructure/limit failures, temporarily overriding fallback block to switch to Gemini",
                            "AI Assistant API 出现基础设施或配额故障，临时覆盖回退禁用并切换到 Gemini"),
                        "responseMode", responseMode,
                        "status", "running"
                    ));
                }
                if (authFailure) {
                    logger.warn("AI Assistant stream: AI Assistant API authentication failed. Falling back to AIProviderFactory.");
                } else {
                    logger.warn("AI Assistant stream: AI Assistant API capacity/rate limit reached. Falling back to AIProviderFactory.");
                }
                emitAiAssistantChatChunk(appId, Map.of(
                    "stage", "gemini_fallback",
                    "modelDecisionStep", "fallback",
                    "modelDecisionReason", authFailure ? "auth_failed" : "payload_too_large",
                    "decision_step", "fallback",
                    "reason_code", authFailure ? "auth_failed" : "payload_too_large",
                    "message", authFailure
                        ? uiTextByLang(
                            uiLang,
                            "AI Assistant API lỗi xác thực token, đang chuyển sang Gemini",
                            "AI Assistant API token authentication failed, switching to Gemini",
                            "AI Assistant API 令牌认证失败，正在切换到 Gemini")
                        : uiTextByLang(
                            uiLang,
                            "AI Assistant API quá tải hoặc vượt giới hạn payload, đang chuyển sang Gemini",
                            "AI Assistant API is overloaded or payload is too large, switching to Gemini",
                            "AI Assistant API 过载或 payload 超限，正在切换到 Gemini"),
                    "responseMode", responseMode,
                    "current", 0,
                    "total", 1,
                    "percent", 0));

                String fallbackPrompt = buildAiAssistantChatPromptText(
                    message,
                    currentCode,
                    language,
                    effectiveContextType,
                    responseMode,
                    attachments,
                    continuityMemory,
                    globalContext,
                    pName,
                    pType,
                    continuityScopeKey,
                    pendingQuestions,
                    true);
                String fallbackRaw = this.aiProviderFactory.generateContent(fallbackPrompt);
                String fallbackText = extractAiResultText(fallbackRaw);
                if (!fallbackText.isBlank()) {
                    fullResponse.append(fallbackText);
                    emitTextAsAiAssistantChunks(appId, fallbackText, responseMode, uiLang);
                }
            }

            if (fullResponse.length() == 0 && menuGeminiFallbackDisabled && !forcedMenuFallbackOverride) {
                String upstreamError = extractAiErrorMessage(githubRaw);
                String messageNoFallback = upstreamError.isBlank()
                    ? uiTextByLang(
                        uiLang,
                        "AI Assistant API không trả về nội dung hợp lệ, menu fallback sang Gemini đang bị tắt",
                        "AI Assistant API did not return valid content, and menu fallback to Gemini is disabled",
                        "AI Assistant API 未返回有效内容，且菜单回退到 Gemini 已禁用")
                    : uiTextByLang(
                        uiLang,
                        "AI Assistant API lỗi: " + upstreamError + " (menu fallback Gemini đang bị tắt)",
                        "AI Assistant API error: " + upstreamError + " (menu fallback to Gemini is disabled)",
                        "AI Assistant API 错误：" + upstreamError + "（菜单回退到 Gemini 已禁用）");
                throw new IllegalStateException(messageNoFallback);
            }

            if (fullResponse.length() == 0) {
                String upstreamError = extractAiErrorMessage(githubRaw);
                String errText;
                if (shouldGeminiFallback) {
                    if (!upstreamError.isBlank()) {
                        errText = uiTextByLang(
                            uiLang,
                            "AI Assistant API lỗi: " + upstreamError,
                            "AI Assistant API error: " + upstreamError,
                            "AI Assistant API 错误：" + upstreamError);
                    } else {
                        errText = uiTextByLang(
                            uiLang,
                            "AI Assistant API và provider fallback đều không trả về nội dung",
                            "Neither AI Assistant API nor fallback provider returned content",
                            "AI Assistant API 与回退提供方均未返回内容");
                    }
                } else {
                    errText = upstreamError.isBlank()
                        ? uiTextByLang(
                            uiLang,
                            "AI không trả về nội dung",
                            "AI did not return content",
                            "AI 未返回内容")
                        : upstreamError;
                }
                throw new IllegalStateException(errText);
            }

            if ("menu_json".equalsIgnoreCase(effectiveContextType)) {
                MenuQualityGateResult gate = evaluateMenuOutputQuality(fullResponse.toString(), attachments);
                if (!gate.passed) {
                    logger.warn("Menu quality gate failed: {}", gate.debugSummary());
                    Map<String, Object> gateFailedPayload = new HashMap<>();
                    gateFailedPayload.put("stage", "menu_quality_gate_failed");
                    gateFailedPayload.put("message", uiTextByLang(
                        uiLang,
                        "Kết quả chưa bám sát nguồn dữ liệu, đang tự động tạo lại 1 lần",
                        "Result is not grounded enough in source data, auto-regenerating once",
                        "结果与源数据匹配度不足，正在自动重生成一次"));
                    gateFailedPayload.put("reason", gate.reason);
                    gateFailedPayload.put("tableOverlap", gate.tableOverlap);
                    gateFailedPayload.put("idOverlap", gate.idOverlap);
                    gateFailedPayload.put("sourceTableCount", gate.sourceTableCount);
                    gateFailedPayload.put("sourceIdCount", gate.sourceIdCount);
                    gateFailedPayload.put("outputTableCount", gate.outputTableCount);
                    gateFailedPayload.put("outputIdCount", gate.outputIdCount);
                    gateFailedPayload.put("genericHits", gate.genericHits);
                    gateFailedPayload.put("responseMode", responseMode);
                    gateFailedPayload.put("status", "running");
                    emitAiAssistantChatChunk(appId, gateFailedPayload);

                    String repairPrompt = buildMenuQualityRepairPrompt(
                        message,
                        fullResponse.toString(),
                        gate,
                        attachments,
                        continuityMemory,
                        globalContext,
                        currentCode,
                        language,
                        pName,
                        pType,
                        continuityScopeKey,
                        pendingQuestions,
                        responseMode);
                    boolean severeGroundingFailure = "generic_output_and_no_source_overlap".equalsIgnoreCase(gate.reason)
                        || "no_table_or_id_overlap_with_source".equalsIgnoreCase(gate.reason)
                        || "no_business_fields_and_no_source_overlap".equalsIgnoreCase(gate.reason);
                    boolean canGateFallbackToProvider = !menuGeminiFallbackDisabled
                        || forcedMenuFallbackOverride
                        || severeGroundingFailure;
                    boolean preferProviderFirstForRepair = canGateFallbackToProvider;
                    String repairText = "";
                    if (preferProviderFirstForRepair) {
                        String providerRaw = this.aiProviderFactory.generateContent(repairPrompt);
                        repairText = extractAiResultText(providerRaw);
                    } else {
                        try {
                            String repairRaw = aiAssistantGatewayService.generateContent(repairPrompt);
                            repairText = extractAiResultText(repairRaw);
                        } catch (Exception repairEx) {
                            logger.warn("Menu quality gate repair via AI Assistant API failed: {}", repairEx.getMessage());
                            emitAiAssistantChatChunk(appId, Map.of(
                                "stage", "menu_quality_gate_aiAssistant_repair_failed",
                                "message", uiTextByLang(
                                    uiLang,
                                    "Lần sửa bằng AI Assistant API thất bại, đang chuyển provider fallback",
                                    "AI Assistant API repair failed, switching to fallback provider",
                                    "AI Assistant API 修复失败，正在切换回退提供方"),
                                "responseMode", responseMode,
                                "status", "running"
                            ));
                        }
                    }
                    if (!repairText.isBlank()) {
                        MenuQualityGateResult repairedGate = evaluateMenuOutputQuality(repairText, attachments);
                        if (repairedGate.passed) {
                            fullResponse.setLength(0);
                            fullResponse.append(repairText);
                            emitTextAsAiAssistantChunks(appId, repairText, responseMode, uiLang);
                            emitAiAssistantChatChunk(appId, Map.of(
                                "stage", "menu_quality_gate_repaired",
                                "message", uiTextByLang(
                                    uiLang,
                                    "Đã tạo lại kết quả menu theo nguồn dữ liệu",
                                    "Menu output regenerated and aligned to source data",
                                    "已按源数据重新生成菜单结果"),
                                "tableOverlap", repairedGate.tableOverlap,
                                "idOverlap", repairedGate.idOverlap,
                                "genericHits", repairedGate.genericHits,
                                "responseMode", responseMode,
                                "status", "running"
                            ));
                        } else {
                            logger.warn("Menu quality gate repair still weak: {}", repairedGate.debugSummary());
                            if (canGateFallbackToProvider) {
                                emitAiAssistantChatChunk(appId, Map.of(
                                    "stage", "menu_quality_gate_provider_fallback",
                                    "message", uiTextByLang(
                                        uiLang,
                                        "Kết quả vẫn chưa bám nguồn sau lần sửa đầu tiên, đang thử provider fallback",
                                        "Output is still weakly grounded after first repair, trying fallback provider",
                                        "首轮修复后结果仍与源数据匹配不足，正在尝试回退提供方"),
                                    "responseMode", responseMode,
                                    "status", "running"
                                ));

                                String providerRaw = this.aiProviderFactory.generateContent(repairPrompt);
                                String providerText = extractAiResultText(providerRaw);
                                if (!providerText.isBlank()) {
                                    MenuQualityGateResult providerGate = evaluateMenuOutputQuality(providerText, attachments);
                                    if (providerGate.passed) {
                                        fullResponse.setLength(0);
                                        fullResponse.append(providerText);
                                        emitTextAsAiAssistantChunks(appId, providerText, responseMode, uiLang);
                                        emitAiAssistantChatChunk(appId, Map.of(
                                            "stage", "menu_quality_gate_provider_repaired",
                                            "message", uiTextByLang(
                                                uiLang,
                                                "Provider fallback đã tạo lại menu bám nguồn dữ liệu",
                                                "Fallback provider regenerated a menu aligned to source data",
                                                "回退提供方已重新生成与源数据匹配的菜单"),
                                            "tableOverlap", providerGate.tableOverlap,
                                            "idOverlap", providerGate.idOverlap,
                                            "genericHits", providerGate.genericHits,
                                            "responseMode", responseMode,
                                            "status", "running"
                                        ));
                                    } else {
                                        String failureJson = buildMenuGroundingFailureResponse(uiLang, gate, providerGate);
                                        fullResponse.setLength(0);
                                        fullResponse.append(failureJson);
                                        emitTextAsAiAssistantChunks(appId, failureJson, responseMode, uiLang);
                                        emitAiAssistantChatChunk(appId, Map.of(
                                            "stage", "menu_quality_gate_repair_failed",
                                            "message", uiTextByLang(
                                                uiLang,
                                                "Đã thử cả provider fallback nhưng vẫn chưa đủ bám nguồn, đã chặn kết quả suy đoán",
                                                "Tried fallback provider but grounding is still insufficient; speculative output was blocked",
                                                "已尝试回退提供方但匹配度仍不足；已拦截推测性结果"),
                                            "initialReason", gate.reason,
                                            "repairReason", providerGate.reason,
                                            "tableOverlap", providerGate.tableOverlap,
                                            "idOverlap", providerGate.idOverlap,
                                            "genericHits", providerGate.genericHits,
                                            "responseMode", responseMode,
                                            "status", "running"
                                        ));
                                    }
                                } else {
                                    String failureJson = buildMenuGroundingFailureResponse(uiLang, gate, repairedGate);
                                    fullResponse.setLength(0);
                                    fullResponse.append(failureJson);
                                    emitTextAsAiAssistantChunks(appId, failureJson, responseMode, uiLang);
                                }
                            } else {
                                String failureJson = buildMenuGroundingFailureResponse(uiLang, gate, repairedGate);
                                fullResponse.setLength(0);
                                fullResponse.append(failureJson);
                                emitTextAsAiAssistantChunks(appId, failureJson, responseMode, uiLang);
                                emitAiAssistantChatChunk(appId, Map.of(
                                    "stage", "menu_quality_gate_repair_failed",
                                    "message", uiTextByLang(
                                        uiLang,
                                        "Không tạo được menu đủ bám nguồn dữ liệu, đã chặn kết quả suy đoán",
                                        "Could not produce a menu grounded enough in source data; speculative output was blocked",
                                        "未能生成与源数据充分匹配的菜单；已拦截推测性结果"),
                                    "initialReason", gate.reason,
                                    "repairReason", repairedGate.reason,
                                    "tableOverlap", repairedGate.tableOverlap,
                                    "idOverlap", repairedGate.idOverlap,
                                    "genericHits", repairedGate.genericHits,
                                    "responseMode", responseMode,
                                    "status", "running"
                                ));
                            }
                        }
                    } else {
                        if (canGateFallbackToProvider) {
                            emitAiAssistantChatChunk(appId, Map.of(
                                "stage", "menu_quality_gate_provider_fallback",
                                "message", uiTextByLang(
                                    uiLang,
                                    "Lần sửa bằng AI Assistant API không có nội dung, đang thử provider fallback",
                                    "AI Assistant API repair returned no content, trying fallback provider",
                                    "AI Assistant API 修复未返回内容，正在尝试回退提供方"),
                                "responseMode", responseMode,
                                "status", "running"
                            ));
                            String providerRaw = this.aiProviderFactory.generateContent(repairPrompt);
                            String providerText = extractAiResultText(providerRaw);
                            if (!providerText.isBlank()) {
                                MenuQualityGateResult providerGate = evaluateMenuOutputQuality(providerText, attachments);
                                if (providerGate.passed) {
                                    fullResponse.setLength(0);
                                    fullResponse.append(providerText);
                                    emitTextAsAiAssistantChunks(appId, providerText, responseMode, uiLang);
                                    emitAiAssistantChatChunk(appId, Map.of(
                                        "stage", "menu_quality_gate_provider_repaired",
                                        "message", uiTextByLang(
                                            uiLang,
                                            "Provider fallback đã tạo lại menu bám nguồn dữ liệu",
                                            "Fallback provider regenerated a menu aligned to source data",
                                            "回退提供方已重新生成与源数据匹配的菜单"),
                                        "tableOverlap", providerGate.tableOverlap,
                                        "idOverlap", providerGate.idOverlap,
                                        "genericHits", providerGate.genericHits,
                                        "responseMode", responseMode,
                                        "status", "running"
                                    ));
                                } else {
                                    String failureJson = buildMenuGroundingFailureResponse(uiLang, gate, providerGate);
                                    fullResponse.setLength(0);
                                    fullResponse.append(failureJson);
                                    emitTextAsAiAssistantChunks(appId, failureJson, responseMode, uiLang);
                                }
                            } else {
                                String failureJson = buildMenuGroundingFailureResponse(uiLang, gate, null);
                                fullResponse.setLength(0);
                                fullResponse.append(failureJson);
                                emitTextAsAiAssistantChunks(appId, failureJson, responseMode, uiLang);
                            }
                        } else {
                            String failureJson = buildMenuGroundingFailureResponse(uiLang, gate, null);
                            fullResponse.setLength(0);
                            fullResponse.append(failureJson);
                            emitTextAsAiAssistantChunks(appId, failureJson, responseMode, uiLang);
                        }
                    }
                }
            }

            StructuredAiAssistantEditResult structuredEdit = extractStructuredAiAssistantEdits(
                fullResponse.toString(),
                countLines(currentCode));
            boolean editMode = "edit".equalsIgnoreCase(responseMode);
            boolean requireStructured = editMode && aiAssistantStructuredEditRequired;
            boolean structuredValid = !requireStructured || structuredEdit.valid;
            List<Map<String, Object>> completionTextEdits = new ArrayList<>(structuredEdit.textEdits);
            String completionDraftText = "";

            if (completionTextEdits.isEmpty() && editMode) {
                String baseDraft = String.valueOf(lastDraftRef.get() == null ? "" : lastDraftRef.get());
                String fallbackDraft = extractMenuDraftForCompletion(fullResponse.toString(), effectiveContextType);
                if (!fallbackDraft.isBlank() && !fallbackDraft.equals(baseDraft)) {
                    List<Map<String, Object>> generated = buildLineTextEdits(baseDraft, fallbackDraft);
                    if (!generated.isEmpty()) {
                        completionTextEdits = generated;
                        completionDraftText = fallbackDraft;
                        Map<String, Object> fallbackPatchPayload = new HashMap<>();
                        fallbackPatchPayload.put("stage", "completion_fallback_patch");
                        fallbackPatchPayload.put("message", uiTextByLang(
                            uiLang,
                            "Đã tạo fallback line-edits từ JSON kết quả cuối",
                            "Generated fallback line-edits from final JSON output",
                            "已从最终 JSON 生成回退 line-edits"));
                        fallbackPatchPayload.put("responseMode", responseMode);
                        fallbackPatchPayload.put("status", "running");
                        fallbackPatchPayload.put("textEdits", generated);
                        fallbackPatchPayload.put("draftText", fallbackDraft);
                        List<Map<String, Object>> fallbackRanges = convertTextEditsToLineRanges(generated);
                        if (!fallbackRanges.isEmpty()) {
                            fallbackPatchPayload.put("lineRanges", fallbackRanges);
                            fallbackPatchPayload.put("changedRanges", fallbackRanges);
                        }
                        emitAiAssistantChatChunk(appId, fallbackPatchPayload);

                        emitAiAssistantChatChunk(appId, Map.of(
                            "stage", "completion_fallback_edits_generated",
                            "message", uiTextByLang(
                                uiLang,
                                "Đã sinh text_edits fallback từ JSON kết quả cuối để đồng bộ editor",
                                "Generated fallback text_edits from final JSON to sync the editor",
                                "已从最终 JSON 生成回退 text_edits 以同步编辑器"),
                            "responseMode", responseMode,
                            "status", "info"
                        ));
                    }
                }
            }

            if (requireStructured && !structuredEdit.valid) {
                emitAiAssistantChatChunk(appId, Map.of(
                    "stage", "structured_edit_missing",
                    "message", uiTextByLang(
                        uiLang,
                        "Phản hồi chưa đúng định dạng text_edits để áp dụng chính xác theo dòng",
                        "Response is missing valid text_edits format for precise line-based apply",
                        "响应缺少有效的 text_edits 格式，无法按行精确应用"),
                    "responseMode", responseMode,
                    "status", "warning"
                ));
            }
            
            // Emit completion event
            Map<String, Object> completion = new HashMap<>();
            completion.put("stage", "complete");
            completion.put("fullResponse", fullResponse.toString());
            completion.put("responseMode", responseMode);
            completion.put("requiresStructuredEdits", requireStructured);
            completion.put("structuredEditValid", structuredValid);
            if (structuredEdit.understandingChecklist != null) {
                completion.put("understandingChecklist", structuredEdit.understandingChecklist);
            }
            if (structuredEdit.assistantMessage != null && !structuredEdit.assistantMessage.isBlank()) {
                completion.put("assistantMessage", structuredEdit.assistantMessage);
            }
            if (!completionTextEdits.isEmpty()) {
                completion.put("textEdits", completionTextEdits);
                if (!completionDraftText.isBlank()) {
                    completion.put("draftText", completionDraftText);
                }
                List<Map<String, Object>> ranges = convertTextEditsToLineRanges(completionTextEdits);
                if (!ranges.isEmpty()) {
                    completion.put("lineRanges", ranges);
                    completion.put("changedRanges", ranges);
                }
            }
            completion.put("timestamp", System.currentTimeMillis());
            emitAiAssistantChatEvent(appId, "aiAssistant_chat_complete", completion);

            aiAssistantGatewayService.appendAiAssistantConversationTurn(
                appId,
                continuityScopeKey,
                message,
                fullResponse.toString(),
                effectiveContextType,
                responseMode,
                attachments);

            Map<String, Object> sharedTurnMeta = new LinkedHashMap<>();
            sharedTurnMeta.put("source", "aiAssistantChatStream");
            sharedTurnMeta.put("responseMode", responseMode);
            sharedTurnMeta.put("continuityScopeKey", continuityScopeKey);
            sharedTurnMeta.put("attachments", attachments == null ? 0 : attachments.size());
            aiConversationContextService.recordTurnWithScopes(
                authCtx.principalId,
                appId,
                effectiveContextType,
                pName,
                pType,
                message,
                fullResponse.toString(),
                sharedTurnMeta);

            int inputCharsEstimate = extractAiAssistantTextPayloadChars(messages);
            int outputCharsEstimate = fullResponse.length();
            int inputTokensEstimate = estimateTokensByChars(inputCharsEstimate);
            int outputTokensEstimate = estimateTokensByChars(outputCharsEstimate);
            logger.info(
                "AI_TELEMETRY flow=ai-assistant-chat appId={} contextType={} taskType={} responseMode={} inputChars~={} inputTokens~={} outputChars={} outputTokens~={} estimatedPayloadChars={} directProviderRoute={} quickProbe={} skipQuickProbe={} geminiFallback={} menuFallbackDisabled={} attachments={}",
                appId,
                effectiveContextType,
                effectiveTaskType,
                responseMode,
                inputCharsEstimate,
                inputTokensEstimate,
                outputCharsEstimate,
                outputTokensEstimate,
                estimatedPayloadChars,
                usedDirectProviderRoute,
                usedQuickPrimaryProbe,
                skipPrimaryProbeForHugePayload,
                usedGeminiFallback,
                menuGeminiFallbackDisabled,
                attachments == null ? 0 : attachments.size());

            Map<String, Object> chatTelemetry = new LinkedHashMap<>();
            chatTelemetry.put("timestamp", System.currentTimeMillis());
            chatTelemetry.put("flow", "ai-assistant-chat");
            chatTelemetry.put("appId", appId);
            chatTelemetry.put("contextType", effectiveContextType);
            chatTelemetry.put("taskType", effectiveTaskType);
            chatTelemetry.put("responseMode", responseMode);
            chatTelemetry.put("inputChars", inputCharsEstimate);
            chatTelemetry.put("inputTokens", inputTokensEstimate);
            chatTelemetry.put("outputChars", outputCharsEstimate);
            chatTelemetry.put("outputTokens", outputTokensEstimate);
            chatTelemetry.put("usedDirectProviderRoute", usedDirectProviderRoute);
            chatTelemetry.put("usedQuickProbe", usedQuickPrimaryProbe);
            chatTelemetry.put("skippedQuickProbe", skipPrimaryProbeForHugePayload);
            chatTelemetry.put("usedGeminiFallback", usedGeminiFallback);
            chatTelemetry.put("attachments", attachments == null ? 0 : attachments.size());
            chatTelemetry.put("elapsedMs", 0);
            chatTelemetry.put("orchestrationEnabled", orchestrationResult != null && orchestrationResult.enabled);
            chatTelemetry.put("orchestrationInputChars", orchestrationResult == null ? 0 : orchestrationResult.totalCharsBefore);
            chatTelemetry.put("orchestrationOutputChars", orchestrationResult == null ? 0 : orchestrationResult.totalCharsAfter);
            chatTelemetry.put("orchestrationSavedChars", orchestrationResult == null ? 0 : orchestrationResult.savedChars);
            chatTelemetry.put("orchestrationPlanSteps", orchestrationResult == null ? 0 : orchestrationResult.planSteps.size());
            chatTelemetry.put("routingTier", orchestrationResult == null ? "" : orchestrationResult.routingTier);
            chatTelemetry.put("preferredModelHint", orchestrationResult == null ? "" : orchestrationResult.preferredModelHint);
            chatTelemetry.put("speculativeExecuted", orchestrationResult != null && orchestrationResult.speculativeExecuted);
            chatTelemetry.put("speculativeOperation", orchestrationResult == null ? "none" : orchestrationResult.speculativeOperation);
            apiCallInstrumentationService.recordAiTelemetry(chatTelemetry);

            response.set("code", 200);
            response.set("success", true);
            response.set("message", uiTextByLang(
                uiLang,
                "Chat hoàn tất",
                "Chat completed",
                "对话已完成"));
            response.set("result", Map.of("fullResponse", fullResponse.toString()));

        } catch (Exception e) {
            logger.error("handleAiAssistantChatStream error: {}", e.getMessage(), e);
            response.set("code", 200);
            response.set("success", false);
            String uiLang = resolveClientUiLanguage(params);
            response.set("message", uiTextByLang(
                uiLang,
                "Chat streaming thất bại: " + e.getMessage(),
                "Chat streaming failed: " + e.getMessage(),
                "对话流式处理失败：" + e.getMessage()));
            emitAiAssistantChatEvent(String.valueOf(params.getOrDefault("appId", "")), "aiAssistant_chat_error", 
                Map.of("error", e.getMessage()));
        }
    }

    private void emitAiAssistantChatDebug(String appId, Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        emitAiAssistantChatEvent(appId, "aiAssistant_chat_debug", payload);
    }

    private String resolveClientUiLanguage(Map<String, Object> params) {
        if (params == null) {
            return "vi";
        }
        String raw = String.valueOf(params.getOrDefault("csm-lang", "")).trim();
        if (raw.isBlank()) {
            raw = String.valueOf(params.getOrDefault("uiLanguage", "")).trim();
        }
        if (raw.isBlank()) {
            raw = String.valueOf(params.getOrDefault("lang", "")).trim();
        }
        String normalized = raw.toLowerCase();
        if (normalized.startsWith("en")) {
            return "en";
        }
        if (normalized.startsWith("zh")) {
            return "zh";
        }
        return "vi";
    }

    private String uiTextByLang(String uiLang, String vi, String en, String zh) {
        String lang = String.valueOf(uiLang == null ? "" : uiLang).trim().toLowerCase();
        if (lang.startsWith("en")) {
            return String.valueOf(en == null ? "" : en);
        }
        if (lang.startsWith("zh")) {
            return String.valueOf(zh == null ? "" : zh);
        }
        return String.valueOf(vi == null ? "" : vi);
    }

    private MenuQualityGateResult evaluateMenuOutputQuality(String output, List<Map<String, Object>> attachments) {
        String text = String.valueOf(output == null ? "" : output).trim();
        if (text.isBlank()) {
            return MenuQualityGateResult.fail("empty_output", 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }

        String lower = text.toLowerCase();
        int genericHits = 0;
        List<String> genericTokens = List.of(
            "menu_product_management",
            "menu_order_management",
            "quản lý sản phẩm",
            "quản lý đơn hàng",
            "product management",
            "order management",
            "product_management",
            "order_management"
        );
        for (String token : genericTokens) {
            if (lower.contains(token.toLowerCase())) {
                genericHits++;
            }
        }

        Set<String> sourceTables = new LinkedHashSet<>();
        Set<String> sourceIds = new LinkedHashSet<>();
        Set<String> sourceLabels = new LinkedHashSet<>();
        collectMenuSourceSignals(attachments, sourceTables, sourceIds, sourceLabels);

        Set<String> outTables = new LinkedHashSet<>();
        Set<String> outIds = new LinkedHashSet<>();
        collectOutputSignals(text, outTables, outIds);

        int tableOverlap = countOverlapNormalized(outTables, sourceTables);
        int idOverlap = countOverlapNormalized(outIds, sourceIds);
        int outputBusinessFieldCount = countNonEmptyMatches(text,
            Pattern.compile("(?i)\\\"(?:table_name|tbl_name|report_name|prefix_pk|field_root)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\""),
            2000);
        int placeholderLabelHits = countPlaceholderMenuLabels(text);
        boolean leafLikeMenu = lower.contains("\"children\"") || lower.contains("\"menu\"") || lower.contains("\"label\"");

        boolean hasRichSource = sourceTables.size() >= 10 || sourceIds.size() >= 30;
        boolean weakGrounding = hasRichSource && tableOverlap == 0 && idOverlap == 0;
        boolean genericLikely = genericHits >= 2;
        boolean placeholderLikely = placeholderLabelHits > 0;
        boolean missingBusinessAnchors = hasRichSource && leafLikeMenu && outputBusinessFieldCount == 0;

        if (weakGrounding && genericLikely) {
            return MenuQualityGateResult.fail(
                "generic_output_and_no_source_overlap",
                tableOverlap,
                idOverlap,
                sourceTables.size(),
                sourceIds.size(),
                outTables.size(),
                outIds.size(),
                genericHits,
                outputBusinessFieldCount,
                placeholderLabelHits);
        }
        if (weakGrounding && missingBusinessAnchors) {
            return MenuQualityGateResult.fail(
                "no_business_fields_and_no_source_overlap",
                tableOverlap,
                idOverlap,
                sourceTables.size(),
                sourceIds.size(),
                outTables.size(),
                outIds.size(),
                genericHits,
                outputBusinessFieldCount,
                placeholderLabelHits);
        }
        if (hasRichSource && placeholderLikely && outputBusinessFieldCount == 0) {
            return MenuQualityGateResult.fail(
                "placeholder_menu_labels_without_business_fields",
                tableOverlap,
                idOverlap,
                sourceTables.size(),
                sourceIds.size(),
                outTables.size(),
                outIds.size(),
                genericHits,
                outputBusinessFieldCount,
                placeholderLabelHits);
        }
        if (weakGrounding && outTables.size() > 0) {
            return MenuQualityGateResult.fail(
                "no_table_or_id_overlap_with_source",
                tableOverlap,
                idOverlap,
                sourceTables.size(),
                sourceIds.size(),
                outTables.size(),
                outIds.size(),
                genericHits,
                outputBusinessFieldCount,
                placeholderLabelHits);
        }
        return MenuQualityGateResult.pass(
            tableOverlap,
            idOverlap,
            sourceTables.size(),
            sourceIds.size(),
            outTables.size(),
            outIds.size(),
            genericHits,
            outputBusinessFieldCount,
            placeholderLabelHits);
    }

    private void collectMenuSourceSignals(
            List<Map<String, Object>> attachments,
            Set<String> tableOut,
            Set<String> idOut,
            Set<String> labelOut) {
        if (attachments == null) return;
        Pattern tableP = Pattern.compile("(?i)\\\"(?:table_name|tbl_name|obj_name|table)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
        Pattern idP = Pattern.compile("(?i)\\\"(?:id|report_id|ma_bc|code)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
        Pattern labelP = Pattern.compile("(?i)\\\"(?:label|ten|display_name|ten_baocao)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
        Pattern sqlTableP = Pattern.compile("(?i)\\b(?:from|join|update|into)\\s+([a-zA-Z0-9_]{3,80})");

        for (Map<String, Object> at : attachments) {
            if (at == null) continue;
            String kind = String.valueOf(at.getOrDefault("kind", "")).trim().toLowerCase();
            if (!"json".equals(kind) && !"text".equals(kind)) continue;
            String body = String.valueOf(at.getOrDefault("textContent", ""));
            if (body.isBlank()) continue;

            String slice = body.length() > 250000
                ? body.substring(0, 140000) + "\n" + body.substring(Math.max(0, body.length() - 110000))
                : body;

            collectByPattern(slice, tableP, tableOut, 1000);
            collectByPattern(slice, idP, idOut, 2000);
            collectByPattern(slice, labelP, labelOut, 1000);
            collectByPattern(slice, sqlTableP, tableOut, 2000);
        }
    }

    private void collectOutputSignals(String text, Set<String> tables, Set<String> ids) {
        Pattern tableP = Pattern.compile("(?i)\\\"(?:table|table_name|tbl_name)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
        Pattern idP = Pattern.compile("(?i)\\\"(?:id|report_id|menu_id|prefix_pk)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
        collectByPattern(text, tableP, tables, 1000);
        collectByPattern(text, idP, ids, 1500);
    }

    private int countNonEmptyMatches(String text, Pattern pattern, int limit) {
        if (text == null || text.isBlank() || pattern == null) return 0;
        Matcher matcher = pattern.matcher(text);
        int count = 0;
        while (matcher.find() && count < Math.max(1, limit)) {
            String value = String.valueOf(matcher.group(1) == null ? "" : matcher.group(1)).trim();
            if (!value.isEmpty()) {
                count++;
            }
        }
        return count;
    }

    private int countPlaceholderMenuLabels(String text) {
        if (text == null || text.isBlank()) return 0;
        Pattern placeholderLabelPattern = Pattern.compile(
            "(?i)\\\"label\\\"\\s*:\\s*\\\"((?:sub)?menu\\s*\\d+|submenu\\s*\\d+|item\\s*\\d+|new menu|menu mới)\\\"");
        return countNonEmptyMatches(text, placeholderLabelPattern, 200);
    }

    private void collectByPattern(String text, Pattern pattern, Set<String> out, int limit) {
        if (text == null || text.isBlank() || pattern == null || out == null) return;
        Matcher m = pattern.matcher(text);
        while (m.find() && out.size() < limit) {
            String v = String.valueOf(m.group(1) == null ? "" : m.group(1)).trim();
            if (v.isEmpty()) continue;
            if (v.length() > 120) continue;
            out.add(v);
        }
    }

    private int countOverlapNormalized(Set<String> left, Set<String> right) {
        if (left == null || right == null || left.isEmpty() || right.isEmpty()) return 0;
        Set<String> normRight = new LinkedHashSet<>();
        for (String v : right) {
            String n = normalizeSignal(v);
            if (!n.isBlank()) normRight.add(n);
        }
        int overlap = 0;
        for (String v : left) {
            String n = normalizeSignal(v);
            if (!n.isBlank() && normRight.contains(n)) {
                overlap++;
            }
        }
        return overlap;
    }

    private String normalizeSignal(String s) {
        return String.valueOf(s == null ? "" : s)
            .trim()
            .toLowerCase()
            .replaceAll("[^a-z0-9_]+", "");
    }

    private String buildMenuQualityRepairPrompt(
            String userMessage,
            String currentOutput,
            MenuQualityGateResult gate,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String globalContext,
            String currentCode,
            String language,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions,
            String responseMode) {
        Set<String> sourceTables = new LinkedHashSet<>();
        Set<String> sourceIds = new LinkedHashSet<>();
        Set<String> sourceLabels = new LinkedHashSet<>();
        collectMenuSourceSignals(attachments, sourceTables, sourceIds, sourceLabels);

        String basePrompt = buildAiAssistantChatPromptText(
            userMessage,
            currentCode,
            language,
            "menu_json",
            responseMode,
            attachments,
            continuityMemory,
            globalContext,
            pName,
            pType,
            continuityScopeKey,
            pendingQuestions,
            true);
        StringBuilder sb = new StringBuilder(basePrompt);
        sb.append("\n\n### QUALITY_GATE_FEEDBACK\n");
        sb.append("Current candidate output failed grounding checks: ").append(gate.reason).append("\n");
        sb.append("Revise the output to strictly align with provided source attachments and global context.\n");
        sb.append("Do NOT use generic demo entities (product/order) unless present in source files.\n");
        sb.append("Any non-empty table_name, tbl_name, report_name, prefix_pk, id, report_id, or menu label must be copied or derived from source signals below, never invented.\n");
        sb.append("If grounding is insufficient, return an empty menu array with warnings instead of fabricated business data.\n");
        sb.append("Return full final menu JSON only.\n\n");
        sb.append("SOURCE_TABLE_SAMPLES:\n").append(formatSignalSamples(sourceTables, 80)).append("\n\n");
        sb.append("SOURCE_ID_SAMPLES:\n").append(formatSignalSamples(sourceIds, 80)).append("\n\n");
        sb.append("SOURCE_LABEL_SAMPLES:\n").append(formatSignalSamples(sourceLabels, 60)).append("\n\n");
        sb.append("CURRENT_FAILED_OUTPUT:\n");
        String current = String.valueOf(currentOutput == null ? "" : currentOutput);
        if (current.length() > 18000) {
            sb.append(current, 0, 18000).append("\n...[truncated]\n");
        } else {
            sb.append(current);
        }
        return sb.toString();
    }

    private String formatSignalSamples(Set<String> values, int limit) {
        if (values == null || values.isEmpty()) {
            return "(none)";
        }
        StringBuilder sb = new StringBuilder();
        int count = 0;
        for (String value : values) {
            String trimmed = String.valueOf(value == null ? "" : value).trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(", ");
            }
            sb.append(trimmed);
            count++;
            if (count >= Math.max(1, limit)) {
                break;
            }
        }
        return sb.length() == 0 ? "(none)" : sb.toString();
    }

    private String buildMenuGroundingFailureResponse(
            String uiLang,
            MenuQualityGateResult initialGate,
            MenuQualityGateResult repairedGate) {
        String warning = uiTextByLang(
            uiLang,
            "Không thể tạo menu đủ bám theo dữ liệu nguồn. Kết quả suy đoán đã bị chặn.",
            "Could not generate a menu sufficiently grounded in the source data. Speculative output was blocked.",
            "无法生成与源数据充分匹配的菜单。推测性结果已被拦截。");
        String nextStep = uiTextByLang(
            uiLang,
            "Cần làm sạch hoặc thu hẹp dữ liệu nguồn lỗi trước khi tạo lại menu.",
            "Clean or narrow the malformed source data before regenerating the menu.",
            "请先清理或缩小异常源数据后再重新生成菜单。");
        String initialReason = initialGate == null ? "" : String.valueOf(initialGate.reason == null ? "" : initialGate.reason);
        String repairReason = repairedGate == null ? "" : String.valueOf(repairedGate.reason == null ? "" : repairedGate.reason);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("menu", new ArrayList<>());
        root.put("notes", new ArrayList<>());
        List<String> warnings = new ArrayList<>();
        warnings.add(warning);
        warnings.add(nextStep);
        if (!initialReason.isBlank()) {
            warnings.add("initial_gate=" + initialReason);
        }
        if (!repairReason.isBlank()) {
            warnings.add("repair_gate=" + repairReason);
        }
        root.put("warnings", warnings);
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root);
        } catch (Exception e) {
            logger.warn("Failed to serialize menu grounding failure response: {}", e.getMessage());
            return "{\"menu\":[],\"notes\":[],\"warnings\":[\"menu_grounding_failed\"]}";
        }
    }

    private static class MenuQualityGateResult {
        final boolean passed;
        final String reason;
        final int tableOverlap;
        final int idOverlap;
        final int sourceTableCount;
        final int sourceIdCount;
        final int outputTableCount;
        final int outputIdCount;
        final int genericHits;
        final int outputBusinessFieldCount;
        final int placeholderLabelHits;

        private MenuQualityGateResult(
                boolean passed,
                String reason,
                int tableOverlap,
                int idOverlap,
                int sourceTableCount,
                int sourceIdCount,
                int outputTableCount,
                int outputIdCount,
                int genericHits,
                int outputBusinessFieldCount,
                int placeholderLabelHits) {
            this.passed = passed;
            this.reason = String.valueOf(reason == null ? "" : reason);
            this.tableOverlap = Math.max(0, tableOverlap);
            this.idOverlap = Math.max(0, idOverlap);
            this.sourceTableCount = Math.max(0, sourceTableCount);
            this.sourceIdCount = Math.max(0, sourceIdCount);
            this.outputTableCount = Math.max(0, outputTableCount);
            this.outputIdCount = Math.max(0, outputIdCount);
            this.genericHits = Math.max(0, genericHits);
            this.outputBusinessFieldCount = Math.max(0, outputBusinessFieldCount);
            this.placeholderLabelHits = Math.max(0, placeholderLabelHits);
        }

        static MenuQualityGateResult pass(
                int tableOverlap,
                int idOverlap,
                int sourceTableCount,
                int sourceIdCount,
                int outputTableCount,
                int outputIdCount,
                int genericHits,
                int outputBusinessFieldCount,
                int placeholderLabelHits) {
            return new MenuQualityGateResult(
                true,
                "ok",
                tableOverlap,
                idOverlap,
                sourceTableCount,
                sourceIdCount,
                outputTableCount,
                outputIdCount,
                genericHits,
                outputBusinessFieldCount,
                placeholderLabelHits);
        }

        static MenuQualityGateResult fail(
                String reason,
                int tableOverlap,
                int idOverlap,
                int sourceTableCount,
                int sourceIdCount,
                int outputTableCount,
                int outputIdCount,
                int genericHits,
                int outputBusinessFieldCount,
                int placeholderLabelHits) {
            return new MenuQualityGateResult(
                false,
                reason,
                tableOverlap,
                idOverlap,
                sourceTableCount,
                sourceIdCount,
                outputTableCount,
                outputIdCount,
                genericHits,
                outputBusinessFieldCount,
                placeholderLabelHits);
        }

        String debugSummary() {
            return "reason=" + reason
                + ", tableOverlap=" + tableOverlap
                + ", idOverlap=" + idOverlap
                + ", sourceTableCount=" + sourceTableCount
                + ", sourceIdCount=" + sourceIdCount
                + ", outputTableCount=" + outputTableCount
                + ", outputIdCount=" + outputIdCount
                + ", genericHits=" + genericHits
                + ", outputBusinessFieldCount=" + outputBusinessFieldCount
                + ", placeholderLabelHits=" + placeholderLabelHits;
        }
    }

    private Map<String, Object> buildAiAssistantDebugPayload(
            String appId,
            String message,
            String currentCode,
            String language,
            String contextType,
            String taskType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String globalContext,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions,
            List<Map<String, Object>> messages) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("stage", "debug");
        payload.put("timestamp", System.currentTimeMillis());
        payload.put("content", renderAiAssistantDebugMessage(
            appId,
            message,
            currentCode,
            language,
            contextType,
            taskType,
            responseMode,
            attachments,
            continuityMemory,
            globalContext,
            pName,
            pType,
            continuityScopeKey,
            pendingQuestions,
            messages));
        return payload;
    }

    private String renderAiAssistantDebugMessage(
            String appId,
            String message,
            String currentCode,
            String language,
            String contextType,
            String taskType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String globalContext,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions,
            List<Map<String, Object>> messages) {
        AiAssistantAttachmentRetrievalResult retrieval = buildAiAssistantRelevantAttachmentContextResult(message, attachments);
        Map<String, Object> debugMeta = new LinkedHashMap<>();
        String normalizedContextType = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase();
        int contextHardCap = "menu_json".equals(normalizedContextType)
            ? AI_ASSISTANT_MENU_CODE_CONTEXT_HARD_CAP_CHARS
            : AI_ASSISTANT_CURRENT_CODE_CONTEXT_HARD_CAP_CHARS;
        debugMeta.put("appId", String.valueOf(appId == null ? "" : appId).trim());
        debugMeta.put("contextType", String.valueOf(contextType == null ? "" : contextType).trim());
        debugMeta.put("taskType", String.valueOf(taskType == null ? "" : taskType).trim());
        debugMeta.put("responseMode", normalizeAiAssistantResponseMode(responseMode, message));
        debugMeta.put("language", String.valueOf(language == null ? "" : language).trim());
        debugMeta.put("pName", String.valueOf(pName == null ? "" : pName).trim());
        debugMeta.put("pType", pType);
        debugMeta.put("continuityScopeKey", String.valueOf(continuityScopeKey == null ? "" : continuityScopeKey).trim());
        debugMeta.put("messageChars", message == null ? 0 : message.length());
        debugMeta.put("currentCodeChars", currentCode == null ? 0 : currentCode.length());
        debugMeta.put("continuityMemoryChars", continuityMemory == null ? 0 : continuityMemory.length());
        debugMeta.put("globalContextChars", globalContext == null ? 0 : globalContext.length());
        debugMeta.put("pendingQuestionsCount", pendingQuestions == null ? 0 : pendingQuestions.size());
        debugMeta.put("attachmentCount", attachments == null ? 0 : attachments.size());
        debugMeta.put("textAttachmentCount", countAiAssistantAttachmentsByKind(attachments, "text", "json"));
        debugMeta.put("imageAttachmentCount", countAiAssistantAttachmentsByKind(attachments, "image"));
        debugMeta.put("messagesSentToAiAssistant", messages == null ? 0 : messages.size());
        debugMeta.put("clientAttachmentSummary", buildAiAssistantAttachmentDebugSummary(attachments));
        debugMeta.put("attachmentRetrievalEnabled", aiAssistantAttachmentRetrievalEnabled);
        debugMeta.put("attachmentRetrievalQueryTokens", retrieval.queryTokens);
        debugMeta.put("attachmentRetrievalFilesUsed", retrieval.filesUsed);
        debugMeta.put("attachmentRetrievalSnippetsUsed", retrieval.snippetsUsed);
        debugMeta.put("attachmentRetrievalChars", retrieval.retrievedChars);
        debugMeta.put("attachmentRetrievalSources", retrieval.sources);

        String messagesJson;
        try {
            messagesJson = objectMapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(sanitizeAiAssistantDebugMessages(messages));
        } catch (Exception ex) {
            messagesJson = String.valueOf(messages);
        }
        debugMeta.put("currentCodeContextHardCapChars", contextHardCap);
        debugMeta.put("aiAssistantTextPayloadChars", extractAiAssistantTextPayloadChars(messages));
        debugMeta.put("payloadIncludesCodeTooLargeMarker", messagesJson.contains("Code too large:"));
        debugMeta.put("payloadIncludesTruncatedMarker", messagesJson.contains("TRUNCATED_FOR_AI_ASSISTANT_CONTEXT"));

        StringBuilder sb = new StringBuilder();
        sb.append("[AI Assistant Debug] Backend payload prepared before calling model.\n\n");
        sb.append("Client + backend context summary:\n");
        sb.append("```json\n");
        sb.append(trimForAiAssistantDebugDisplay(toPrettyJson(debugMeta), AI_ASSISTANT_DEBUG_MARKDOWN_MAX_CHARS / 2));
        sb.append("\n```\n\n");

        if (aiAssistantAttachmentRetrievalEnabled && retrieval != null && !retrieval.context.isBlank()) {
            sb.append("Attachment Retrieval Preview:\n");
            sb.append("```text\n");
            sb.append(trimForAiAssistantDebugDisplay(retrieval.context, AI_ASSISTANT_DEBUG_RETRIEVAL_PREVIEW_MAX_CHARS));
            sb.append("\n```\n\n");
        }

        sb.append("Messages sent to AI Assistant:\n");
        sb.append("```json\n");
        sb.append(trimForAiAssistantDebugDisplay(messagesJson, AI_ASSISTANT_DEBUG_MESSAGES_JSON_MAX_CHARS));
        sb.append("\n```\n");
        return trimForAiAssistantDebugDisplay(sb.toString(), AI_ASSISTANT_DEBUG_MARKDOWN_MAX_CHARS);
    }

    private int extractAiAssistantTextPayloadChars(List<Map<String, Object>> messages) {
        if (messages == null || messages.isEmpty()) {
            return 0;
        }
        int total = 0;
        for (Map<String, Object> message : messages) {
            if (message == null || message.isEmpty()) {
                continue;
            }
            Object content = message.get("content");
            if (content instanceof String text) {
                total += text.length();
                continue;
            }
            if (content instanceof List<?> parts) {
                for (Object partObj : parts) {
                    if (!(partObj instanceof Map<?, ?> part)) {
                        continue;
                    }
                    Object typeObj = part.get("type");
                    String type = typeObj == null ? "" : String.valueOf(typeObj);
                    if (!"text".equals(type)) {
                        continue;
                    }
                    Object textObj = part.get("text");
                    if (textObj != null) {
                        total += String.valueOf(textObj).length();
                    }
                }
            }
        }
        return total;
    }

    private String toPrettyJson(Object value) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            return String.valueOf(value);
        }
    }

    private int countAiAssistantAttachmentsByKind(List<Map<String, Object>> attachments, String... kinds) {
        if (attachments == null || attachments.isEmpty() || kinds == null || kinds.length == 0) {
            return 0;
        }
        Set<String> acceptedKinds = Set.of(kinds);
        int count = 0;
        for (Map<String, Object> attachment : attachments) {
            String kind = String.valueOf(attachment == null ? "" : attachment.getOrDefault("kind", "")).trim().toLowerCase();
            if (acceptedKinds.contains(kind)) {
                count += 1;
            }
        }
        return count;
    }

    private List<Map<String, Object>> buildAiAssistantAttachmentDebugSummary(List<Map<String, Object>> attachments) {
        List<Map<String, Object>> summary = new ArrayList<>();
        if (attachments == null || attachments.isEmpty()) {
            return summary;
        }
        for (Map<String, Object> attachment : attachments) {
            if (attachment == null) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("kind", attachment.get("kind"));
            item.put("name", attachment.get("name"));
            item.put("mimeType", attachment.get("mimeType"));
            item.put("size", attachment.get("size"));
            item.put("contextRole", attachment.get("contextRole"));
            item.put("authoritative", Boolean.parseBoolean(String.valueOf(attachment.getOrDefault("authoritative", "false"))));
            item.put("fullContext", Boolean.parseBoolean(String.valueOf(attachment.getOrDefault("fullContext", "false"))));
            item.put("summary", attachment.get("summary"));
            String textContent = String.valueOf(attachment.getOrDefault("textContent", "")).trim();
            if (!textContent.isEmpty()) {
                item.put("textChars", textContent.length());
            }
            String dataUrl = String.valueOf(attachment.getOrDefault("dataUrl", "")).trim();
            if (!dataUrl.isEmpty()) {
                item.put("imageSource", sanitizeAiAssistantDebugImageUrl(dataUrl));
            }
            summary.add(item);
        }
        return summary;
    }

    private String buildAiAssistantAttachmentRequestLogLine(List<Map<String, Object>> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return "[]";
        }
        List<String> parts = new ArrayList<>();
        for (Map<String, Object> attachment : attachments) {
            if (attachment == null) {
                continue;
            }
            String name = String.valueOf(attachment.getOrDefault("name", "")).trim();
            if (name.length() > 80) {
                name = name.substring(0, 80) + "...";
            }
            String kind = String.valueOf(attachment.getOrDefault("kind", "")).trim();
            String contextRole = String.valueOf(attachment.getOrDefault("contextRole", "")).trim();
            boolean authoritative = Boolean.parseBoolean(String.valueOf(attachment.getOrDefault("authoritative", "false")));
            boolean fullContext = Boolean.parseBoolean(String.valueOf(attachment.getOrDefault("fullContext", "false")));
            String textContent = String.valueOf(attachment.getOrDefault("textContent", "")).trim();
            int textChars = textContent.length();
            parts.add("{name='" + name + "', kind='" + kind + "', contextRole='" + contextRole + "', authoritative=" + authoritative + ", fullContext=" + fullContext + ", textChars=" + textChars + "}");
        }
        return "[" + String.join(", ", parts) + "]";
    }

    private List<Map<String, Object>> sanitizeAiAssistantDebugMessages(List<Map<String, Object>> messages) {
        List<Map<String, Object>> sanitized = new ArrayList<>();
        if (messages == null || messages.isEmpty()) {
            return sanitized;
        }
        for (Map<String, Object> message : messages) {
            if (message == null) {
                continue;
            }
            Map<String, Object> next = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : message.entrySet()) {
                next.put(entry.getKey(), sanitizeAiAssistantDebugValue(entry.getValue()));
            }
            sanitized.add(next);
        }
        return sanitized;
    }

    private Object sanitizeAiAssistantDebugValue(Object value) {
        if (value instanceof Map<?, ?> rawMap) {
            Map<String, Object> sanitized = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                String key = String.valueOf(entry.getKey());
                Object nextValue = entry.getValue();
                if ("url".equals(key) && nextValue instanceof String urlText) {
                    sanitized.put(key, sanitizeAiAssistantDebugImageUrl(urlText));
                } else {
                    sanitized.put(key, sanitizeAiAssistantDebugValue(nextValue));
                }
            }
            return sanitized;
        }
        if (value instanceof List<?> rawList) {
            List<Object> sanitized = new ArrayList<>();
            for (Object item : rawList) {
                sanitized.add(sanitizeAiAssistantDebugValue(item));
            }
            return sanitized;
        }
        if (value instanceof String text) {
            if (text.startsWith("data:image/")) {
                return sanitizeAiAssistantDebugImageUrl(text);
            }
            return text;
        }
        return value;
    }

    private String sanitizeAiAssistantDebugImageUrl(String url) {
        String value = String.valueOf(url == null ? "" : url).trim();
        if (value.startsWith("data:image/")) {
            int commaIndex = value.indexOf(',');
            String header = commaIndex > 0 ? value.substring(0, commaIndex) : "data:image/*;base64";
            return header + ",[omitted:" + value.length() + " chars]";
        }
        return trimForAiAssistantDebugDisplay(value, 240);
    }

    private String trimForAiAssistantDebugDisplay(String text, int maxChars) {
        String value = String.valueOf(text == null ? "" : text);
        if (maxChars <= 0 || value.length() <= maxChars) {
            return value;
        }
        int keepHead = Math.max(200, (int) Math.floor(maxChars * 0.7));
        int keepTail = Math.max(80, maxChars - keepHead - 32);
        if (keepHead + keepTail + 32 > maxChars) {
            keepTail = Math.max(40, maxChars - keepHead - 32);
        }
        String head = value.substring(0, Math.min(keepHead, value.length())).trim();
        String tail = value.substring(Math.max(0, value.length() - keepTail)).trim();
        return head + "\n...[TRUNCATED_FOR_DEBUG]...\n" + tail;
    }

    private List<Map<String, Object>> buildAiAssistantChatMessages(
            String appId,
            String message,
            String currentCode,
            String language,
            String contextType,
            String taskType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String globalContext,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions) {
        String normalizedContext = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase();
        String normalizedMode = normalizeAiAssistantResponseMode(responseMode, message);
        String menuKnowledge = this.aiAssistantGatewayService.buildAiAssistantMenuKnowledgeBlock(appId, normalizedContext, taskType);
        String systemPrompt;
        if ("menu_json".equals(normalizedContext)) {
            systemPrompt = String.join("\n",
                "You are an AI assistant for menu JSON design inside a CodeMirror editor.",
                "Focus on JSON schema correctness, parent/child integrity, field consistency and trigger safety.",
                "Use any attached text files or images as direct context for the user's menu design request.",
                "Do not output unrelated source code. Keep structure stable unless user requests a structural change.",
                "FLOW_LOCK: MENU_MANAGER_ONLY. You must prioritize current menu draft + system requirement docs + legacy menu JSON + business-logic references.",
                "When editing, produce directly applicable JSON changes for the currently open menu draft.");
            if (!menuKnowledge.isBlank()) {
                systemPrompt = systemPrompt + "\n\n" + menuKnowledge;
            }
        } else {
            systemPrompt = String.join("\n",
                "You are a coding assistant inside a CodeMirror editor.",
                "Respond concisely with practical code suggestions and explanations.",
                "Use any attached text files or images as direct context for the user's request.",
                "Always preserve existing code unless explicitly asked to rewrite.",
                "FLOW_LOCK: CODE_EDITOR_ONLY. Focus strictly on p_name, p_type and the current programming language buffer.",
                "Do not switch to menu-architecture design unless the request is explicitly in menu flow.");
        }

        if ("analyze".equals(normalizedMode)) {
            systemPrompt = systemPrompt + "\n\n"
                + "OUTPUT MODE: ANALYZE_ONLY.\n"
                + "Return explanation and analysis text only.\n"
                + "Do NOT generate replacement code blocks, full JSON payloads, or patch instructions unless user explicitly asks to edit/apply changes.";
        } else {
            if ("menu_json".equals(normalizedContext)) {
                systemPrompt = systemPrompt + "\n\n"
                    + "OUTPUT MODE: MENU_EDIT_APPLY.\n"
                    + "Return ONLY valid menu JSON for direct editor apply (object with menu field, or menu array).\n"
                    + "Do NOT wrap output in summary/code/changes object.\n"
                    + "Do NOT use markdown/code fences or extra commentary outside JSON.";
            } else {
                systemPrompt = systemPrompt + "\n\n"
                    + "OUTPUT MODE: EDIT_ALLOWED.\n"
                    + "When user asks to modify, return directly applicable code/JSON with minimal commentary.";
            }
        }

        Object userContent = buildAiAssistantUserContent(
            message,
            currentCode,
            language,
            normalizedContext,
            normalizedMode,
            attachments,
            continuityMemory,
            globalContext,
            pName,
            pType,
            continuityScopeKey,
            pendingQuestions);
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt));
        messages.add(Map.of("role", "user", "content", userContent));
        return messages;
    }

    private Object buildAiAssistantUserContent(
            String message,
            String currentCode,
            String language,
            String contextType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String globalContext,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions) {
        String promptText = buildAiAssistantChatPromptText(
            message,
            currentCode,
            language,
            contextType,
            responseMode,
            attachments,
            continuityMemory,
            globalContext,
            pName,
            pType,
            continuityScopeKey,
            pendingQuestions,
            false);
        List<Map<String, Object>> imageParts = new ArrayList<>();
        for (Map<String, Object> attachment : attachments) {
            String kind = String.valueOf(attachment.getOrDefault("kind", "")).trim().toLowerCase();
            String dataUrl = String.valueOf(attachment.getOrDefault("dataUrl", "")).trim();
            if (!"image".equals(kind) || dataUrl.isEmpty()) {
                continue;
            }
            imageParts.add(Map.of(
                "type", "image_url",
                "image_url", Map.of("url", dataUrl)));
        }

        if (imageParts.isEmpty()) {
            return promptText;
        }

        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", promptText));
        content.addAll(imageParts);
        return content;
    }

    private String buildAiAssistantChatPromptText(String message, String currentCode, String language, String contextType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String globalContext,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions,
            boolean includeSystemHeader) {
        StringBuilder sb = new StringBuilder();
        String normalizedContext = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase();
        String normalizedMode = normalizeAiAssistantResponseMode(responseMode, message);
        String effectiveCurrentCode = String.valueOf(currentCode == null ? "" : currentCode);
        String effectiveContinuityMemory = optimizeAiAssistantContextSegment(continuityMemory, normalizedContext, normalizedMode, true);
        String effectiveGlobalContext = optimizeAiAssistantContextSegment(globalContext, normalizedContext, normalizedMode, false);
        int promptHardCap = resolveAiAssistantPromptHardCap(normalizedContext);

        if ("code".equals(normalizedContext) && "analyze".equals(normalizedMode)
            && !effectiveCurrentCode.isBlank()) {
            effectiveCurrentCode = truncateMiddle(
                effectiveCurrentCode,
                Math.max(8000, aiAssistantPromptBudgetCodeAnalyzeCurrentCodeMaxChars));
        }
        if (includeSystemHeader) {
            if ("menu_json".equals(normalizedContext)) {
                // Try to use the custom instructions file (reduces repeated token cost for static rules)
                String customInstructions = loadAiAssistantCustomInstructions();
                if (!customInstructions.isBlank()) {
                    sb.append("## CUSTOM INSTRUCTIONS (authoritative system rules — do not repeat in output)\n");
                    sb.append(customInstructions).append("\n\n");
                } else {
                    // Fallback inline rules when custom instructions file is unavailable
                    sb.append("You are an AI assistant for menu JSON design inside a CodeMirror editor.\n");
                    sb.append("Focus on JSON schema correctness, parent/child integrity, field consistency and trigger safety.\n");
                    sb.append("Do not output unrelated source code. Keep structure stable unless user requests a structural change.\n");
                    sb.append("Use attached legacy JSON, text notes and UI screenshots as authoritative context when relevant.\n\n");
                    sb.append("For menu_json edits, return complete and production-ready JSON result.\n");
                    sb.append("Do not return shortened placeholders like '...' or 'same as above'.\n");
                    sb.append("Preserve unrelated nodes and properties unless the user explicitly asks to remove or refactor them.\n\n");
                }
                sb.append("GROUNDING RULES FOR MENU_JSON (critical):\n");
                sb.append("- Do NOT invent new trigger IDs, table names, report IDs or business entities not present in provided context.\n");
                sb.append("- Prefer reusing existing ids/keys/paths from legacy configs when possible.\n");
                sb.append("- If required source mapping is missing, return a clear validation note instead of fabricating generic placeholders.\n");
                sb.append("- Keep labels/domain terms aligned with source language and data (no generic demo labels like Product/Order unless explicitly requested).\n\n");
                sb.append("MULTILINGUAL OUTPUT RULES (required for menu_json):\n");
                sb.append("- Every menu node must include: label (VI), label_en (EN), label_zh (ZH).\n");
                sb.append("- Every table field must include: f_header (VI), f_header_en (EN), f_header_zh (ZH).\n");
                sb.append("- If precise EN/ZH wording is uncertain, use best-effort translation and avoid leaving *_en/*_zh empty.\n\n");
            } else {
                sb.append("You are a coding assistant inside a CodeMirror editor.\n");
                sb.append("Respond concisely with practical code suggestions and explanations.\n");
                sb.append("Always preserve existing code unless explicitly asked to rewrite.\n");
                sb.append("Use attached files and images as direct context for the request.\n\n");
            }

            if ("analyze".equals(normalizedMode)) {
                sb.append("Response mode: analyze_only. Return text analysis only, no direct replacement code or JSON output unless explicitly requested.\n\n");
            } else {
                if ("menu_json".equals(normalizedContext)) {
                    sb.append("Response mode: menu_edit_apply.\n");
                    sb.append("Output contract (strict): return ONLY a valid menu JSON payload for editor apply.\n");
                    sb.append("Allowed top-level forms: {\"menu\":[...]} or [...].\n");
                    sb.append("Forbidden: wrapper object with summary/code/changes, markdown code fences, prose before/after JSON.\n");
                    sb.append("If you need to explain, do it by embedding notes in JSON-safe fields only when already part of schema.\n");
                } else {
                    sb.append("Response mode: edit_allowed. If user asks to modify, provide directly applicable code/JSON result.\n");
                }
                if (aiAssistantAskBeforeEditEnabled) {
                    sb.append("Before any patch/code output, include section 'UNDERSTANDING_CHECKLIST' with:\n");
                    sb.append("- Goal in 1-2 lines\n");
                    sb.append("- Exact scope (files/symbols/regions)\n");
                    sb.append("- Assumptions and potential risks\n");
                    sb.append("If critical requirements are ambiguous, ask clarifying questions first, then pause editing.\n\n");
                } else {
                    sb.append("\n");
                }
                if (aiAssistantStructuredEditRequired && !"menu_json".equals(normalizedContext)) {
                    sb.append("STRUCTURED_EDIT_OUTPUT (required for apply):\n");
                    sb.append("Return JSON object only (no markdown fences) using this shape:\n");
                    sb.append("{\n");
                    sb.append("  \"understanding_checklist\": {\"goal\":\"...\",\"scope\":\"...\",\"assumptions\":[\"...\"],\"risks\":[\"...\"]},\n");
                    sb.append("  \"text_edits\": [{\"startLine\":1,\"endLine\":1,\"replacement\":\"...\"}],\n");
                    sb.append("  \"assistant_message\": \"optional short note\"\n");
                    sb.append("}\n");
                    sb.append("Rules: text_edits line numbers are 1-based and replacements must be directly applicable to current editor content.\n\n");
                }
            }
        }

        if ("code".equals(normalizedContext)) {
            String normalizedPName = String.valueOf(pName == null ? "" : pName).trim();
            sb.append("Coding target identity (must stay stable unless user asks to switch):\n");
            sb.append("- p_name: ").append(normalizedPName.isEmpty() ? "(unsaved or not selected)" : normalizedPName).append("\n");
            sb.append("- p_type: ").append(pType == null ? "(unknown)" : pType).append("\n");
            sb.append("- current_language_from_codemirror: ").append(String.valueOf(language == null ? "" : language).trim()).append("\n");
            if (continuityScopeKey != null && !continuityScopeKey.isBlank()) {
                sb.append("- continuity_scope_key: ").append(continuityScopeKey).append("\n");
            }
            sb.append("When answering, continue from previous unresolved coding thread for this exact identity. Do not restart from scratch.\n");
            sb.append("STRICT SOURCE BINDING: ACTIVE FILE IN EDITOR is the primary source of truth.\n");
            sb.append("If a required region is not visible in active editor context, ask for that region explicitly instead of inventing code.\n\n");
        }

        if (pendingQuestions != null && !pendingQuestions.isEmpty()) {
            sb.append("UNRESOLVED QUESTIONS FROM PREVIOUS TURN (answer these first if still relevant):\n");
            int idx = 1;
            for (String q : pendingQuestions) {
                String item = String.valueOf(q == null ? "" : q).trim();
                if (item.isEmpty()) continue;
                sb.append(idx++).append(". ").append(item).append("\n");
                if (idx > 8) break;
            }
            sb.append("\n");
        }

        if (!effectiveContinuityMemory.isBlank()) {
            sb.append("SESSION CONTINUITY MEMORY (continue from unresolved thread, do not restart from scratch):\n");
            sb.append(effectiveContinuityMemory).append("\n\n");
        }

        if ("menu_json".equals(normalizedContext) && !effectiveGlobalContext.isBlank()) {
            sb.append("GLOBAL_CONTEXT_MEMORY (compressed summaries from feeding+consolidation stages):\n");
            sb.append(effectiveGlobalContext).append("\n\n");
        }
        if ("code".equals(normalizedContext) && !effectiveGlobalContext.isBlank()) {
            sb.append("CODE_CHAINING_CONTEXT (derived from full large editor code, secondary to ACTIVE FILE IN EDITOR):\n");
            sb.append(effectiveGlobalContext).append("\n\n");
        }
        
        if (!effectiveCurrentCode.trim().isEmpty()) {
            sb.append(buildAiAssistantActiveEditorContextBlock(effectiveCurrentCode, message, normalizedContext, language, pName));
        }

        if (!attachments.isEmpty()) {
            sb.append(buildAiAssistantAttachmentContextBlock(message, attachments, normalizedContext, language, normalizedMode));
        }

        sb.append("Context type: ").append(normalizedContext).append("\n");
        sb.append("User request: ").append(message == null ? "" : message);
        return trimAiAssistantCodeContext(sb.toString(), promptHardCap);
    }

    private int resolveAiAssistantPromptHardCap(String normalizedContext) {
        if ("menu_json".equalsIgnoreCase(String.valueOf(normalizedContext == null ? "" : normalizedContext).trim())) {
            return Math.max(60000, aiAssistantPromptBudgetMenuMaxChars);
        }
        return Math.max(40000, aiAssistantPromptBudgetCodeMaxChars);
    }

    private String optimizeAiAssistantContextSegment(
            String raw,
            String normalizedContext,
            String normalizedMode,
            boolean continuitySegment) {
        String text = String.valueOf(raw == null ? "" : raw).trim();
        if (text.isBlank()) {
            return "";
        }
        int configuredCap = continuitySegment
            ? Math.max(8000, aiAssistantPromptBudgetContinuityMaxChars)
            : Math.max(12000, aiAssistantPromptBudgetGlobalMaxChars);

        int modeCap = configuredCap;
        if ("analyze".equalsIgnoreCase(normalizedMode)) {
            modeCap = continuitySegment ? Math.min(modeCap, 12000) : Math.min(modeCap, 20000);
        }
        if ("code".equalsIgnoreCase(String.valueOf(normalizedContext == null ? "" : normalizedContext).trim())) {
            modeCap = continuitySegment ? Math.min(modeCap, 18000) : Math.min(modeCap, 30000);
        }

        return truncateMiddle(text, Math.max(4000, modeCap));
    }

    private String buildAiAssistantQuickProbePromptText(
            String message,
            String currentCode,
            String language,
            String contextType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String globalContext,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions) {
        String fullPrompt = buildAiAssistantChatPromptText(
            message,
            currentCode,
            language,
            contextType,
            responseMode,
            attachments,
            continuityMemory,
            globalContext,
            pName,
            pType,
            continuityScopeKey,
            pendingQuestions,
            true);
        int maxChars = Math.max(8000, aiAssistantMenuPrimaryProbeMaxPromptChars);
        if (fullPrompt.length() <= maxChars) {
            return fullPrompt;
        }
        int headChars = (int) Math.floor(maxChars * 0.65);
        int tailChars = Math.max(1000, maxChars - headChars - 200);
        String head = fullPrompt.substring(0, Math.min(fullPrompt.length(), headChars));
        String tail = fullPrompt.substring(Math.max(0, fullPrompt.length() - tailChars));
        return head
            + "\n\n[QUICK_PROBE_CONTEXT_TRUNCATED]\n"
            + "Context was truncated for fast one-shot probe before provider fallback.\n\n"
            + tail;
    }

    private Integer parseNullableInteger(Object raw) {
        if (raw == null) return null;
        try {
            String text = String.valueOf(raw).trim();
            if (text.isEmpty() || "null".equalsIgnoreCase(text)) return null;
            return Integer.valueOf(text);
        } catch (Exception ignored) {
            return null;
        }
    }

    private long parseLongOrDefault(Object raw, long fallback) {
        if (raw == null) return fallback;
        if (raw instanceof Number number) return number.longValue();
        try {
            return Long.parseLong(String.valueOf(raw).trim());
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private String buildAiAssistantContinuityScopeKey(String contextType, String language, String pName, Integer pType) {
        String normalizedContext = normalizeScopeToken(contextType, "code");
        String normalizedLanguage = normalizeScopeToken(language, "javascript");
        String normalizedPName = normalizeScopeToken(pName, "unsaved");
        String normalizedPType = pType == null ? "na" : String.valueOf(pType);
        return String.join("__",
            "ctx_" + normalizedContext,
            "lang_" + normalizedLanguage,
            "pname_" + normalizedPName,
            "ptype_" + normalizedPType);
    }

    private String normalizeScopeToken(String raw, String fallback) {
        String text = String.valueOf(raw == null ? "" : raw).trim().toLowerCase();
        if (text.isEmpty()) text = fallback;
        String normalized = Normalizer.normalize(text, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .replaceAll("[^a-z0-9_-]", "_")
            .replaceAll("_+", "_")
            .replaceAll("^-|-$", "");
        return normalized.isEmpty() ? fallback : normalized;
    }

    private boolean isMenuAiAssistantFlow(String contextType, String taskType) {
        String normalizedContext = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase();
        String normalizedTask = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase();
        return "menu_json".equals(normalizedContext)
            || "menu_design".equals(normalizedTask)
            || "menu_design_refine".equals(normalizedTask)
            || "menu_design_incremental_update".equals(normalizedTask)
            || "menu_design_generate".equals(normalizedTask)
            || "menu".equals(normalizedTask);
    }

    private String normalizeAiAssistantFlowType(String flowType, String contextType, String taskType) {
        String normalized = String.valueOf(flowType == null ? "" : flowType).trim().toLowerCase();
        if ("menu_manager".equals(normalized) || "code_editor".equals(normalized)) {
            return normalized;
        }
        return isMenuAiAssistantFlow(contextType, taskType) ? "menu_manager" : "code_editor";
    }

    private String trimAiAssistantContinuityMemory(String memory) {
        String text = String.valueOf(memory == null ? "" : memory).trim();
        if (text.isEmpty()) return "";
        if (text.length() <= AI_ASSISTANT_CONTINUITY_MEMORY_MAX_CHARS) return text;
        return text.substring(text.length() - AI_ASSISTANT_CONTINUITY_MEMORY_MAX_CHARS);
    }

    private String buildAiAssistantCurrentCodeContext(String currentCode, String message, String contextType, String language) {
        String code = currentCode == null ? "" : currentCode;
        boolean isMenuContext = "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType).trim());

        int maxChars = isMenuContext ? AI_ASSISTANT_MENU_CODE_MAX_CHARS : AI_ASSISTANT_CURRENT_CODE_MAX_CHARS;
        int headChars = isMenuContext ? AI_ASSISTANT_MENU_CODE_HEAD_CHARS : AI_ASSISTANT_CURRENT_CODE_HEAD_CHARS;
        int tailChars = isMenuContext ? AI_ASSISTANT_MENU_CODE_TAIL_CHARS : AI_ASSISTANT_CURRENT_CODE_TAIL_CHARS;
        int focusWindowChars = isMenuContext ? AI_ASSISTANT_MENU_CODE_FOCUS_WINDOW_CHARS : AI_ASSISTANT_CURRENT_CODE_FOCUS_WINDOW_CHARS;
        int hardCapChars = isMenuContext ? AI_ASSISTANT_MENU_CODE_CONTEXT_HARD_CAP_CHARS : AI_ASSISTANT_CURRENT_CODE_CONTEXT_HARD_CAP_CHARS;

        boolean useLargeCodeMode = !isMenuContext
            && aiAssistantCodeLargeContextEnabled
            && code.length() > Math.max(100000, aiAssistantCodeLargeThresholdChars);
        if (useLargeCodeMode) {
            List<String> focusExcerpts = buildAiAssistantFocusExcerpts(code, message, Math.max(12000, focusWindowChars));
            List<String> distributedExcerpts = buildCodeDistributedCoverageExcerpts(
                code,
                AI_ASSISTANT_CODE_DISTRIBUTED_EXCERPT_MAX_ITEMS,
                AI_ASSISTANT_CODE_DISTRIBUTED_EXCERPT_CHARS);
            String globalMap = buildAiAssistantGlobalCodeMap(code, language);

            int lineCount = countLines(code);
            String fingerprint = Integer.toHexString(code.hashCode());
            StringBuilder sb = new StringBuilder();
            sb.append("/* LARGE_EDITOR_CODE_CONTEXT mode enabled */\n");
            sb.append("/* full_chars=").append(code.length())
                .append(", full_lines=").append(lineCount)
                .append(", fingerprint=").append(fingerprint).append(" */\n");
            sb.append("/* Priority: keep edits consistent with this file identity and visible excerpts. */\n\n");

            if (!globalMap.isBlank()) {
                sb.append("/* ===== GLOBAL FILE MAP (from full scan) ===== */\n");
                sb.append(globalMap).append("\n");
            }

            if (!focusExcerpts.isEmpty()) {
                int idx = 1;
                for (String focus : focusExcerpts) {
                    if (focus == null || focus.isBlank()) continue;
                    sb.append("/* ===== REQUEST-FOCUS EXCERPT ").append(idx++)
                        .append(" ===== */\n");
                    sb.append(focus).append("\n");
                }
            }

            if (!distributedExcerpts.isEmpty()) {
                sb.append("/* ===== DISTRIBUTED COVERAGE EXCERPTS (across full file) ===== */\n");
                for (String excerpt : distributedExcerpts) {
                    if (excerpt == null || excerpt.isBlank()) continue;
                    sb.append(excerpt).append("\n");
                }
            }

            String head = code.substring(0, Math.min(7000, code.length()));
            String tail = code.substring(Math.max(0, code.length() - 7000));
            sb.append("/* ===== HEAD STABILIZER ===== */\n").append(head).append("\n");
            sb.append("/* ===== TAIL STABILIZER ===== */\n").append(tail);
            String packaged = sb.toString();
            String trimmed = trimAiAssistantCodeContext(packaged, Math.max(hardCapChars, 180000));
            double ratio = code.isEmpty() ? 1.0 : ((double) trimmed.length() / (double) code.length());
            logger.info("AI Assistant large-code context pack: inputChars={} packagedChars={} finalChars={} ratio={} fileHash={}",
                code.length(),
                packaged.length(),
                trimmed.length(),
                String.format(java.util.Locale.ROOT, "%.4f", ratio),
                Integer.toHexString(code.hashCode()));
            return trimmed;
        }

        if (code.length() <= maxChars) {
            return trimAiAssistantCodeContext(code, hardCapChars);
        }

        int safeHead = Math.max(1000, Math.min(headChars, code.length()));
        int safeTail = Math.max(1000, Math.min(tailChars, Math.max(0, code.length() - safeHead)));
        String head = code.substring(0, safeHead);
        String tail = code.substring(Math.max(0, code.length() - safeTail));
        List<String> focusExcerpts = buildAiAssistantFocusExcerpts(code, message, focusWindowChars);
        String globalMap = buildAiAssistantGlobalCodeMap(code, language);

        StringBuilder sb = new StringBuilder();
        sb.append("/* Code too large: ").append(code.length())
            .append(" chars. Showing GLOBAL MAP + HEAD + MULTI-FOCUS + TAIL excerpts for better understanding. */\n");
        if (!globalMap.isBlank()) {
            sb.append("/* ===== GLOBAL FILE MAP (derived from full file) ===== */\n");
            sb.append(globalMap).append("\n");
        }
        sb.append("/* ===== HEAD EXCERPT ===== */\n");
        sb.append(head).append("\n");
        if (!focusExcerpts.isEmpty()) {
            int excerptIndex = 1;
            for (String focus : focusExcerpts) {
                if (focus == null || focus.isBlank()) {
                    continue;
                }
                sb.append("/* ===== FOCUS EXCERPT ").append(excerptIndex++)
                    .append(" (matched by request keywords) ===== */\n");
                sb.append(focus).append("\n");
            }
        }
        sb.append("/* ===== TAIL EXCERPT ===== */\n");
        sb.append(tail);
        return trimAiAssistantCodeContext(sb.toString(), hardCapChars);
    }

    private String buildAiAssistantActiveEditorContextBlock(
            String currentCode,
            String message,
            String contextType,
            String language,
            String pName) {
        String normalizedContext = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase();
        String normalizedPName = String.valueOf(pName == null ? "" : pName).trim();
        String normalizedLanguage = String.valueOf(language == null ? "" : language).trim();
        String contextualCode = buildAiAssistantCurrentCodeContext(currentCode, message, normalizedContext, normalizedLanguage);
        StringBuilder sb = new StringBuilder();

        if ("menu_json".equals(normalizedContext)) {
            sb.append("CURRENT MENU DRAFT IN EDITOR (AUTHORITATIVE BASE TREE)\n");
            sb.append("- file_key: ").append(normalizedPName.isEmpty() ? "(unsaved or not selected)" : normalizedPName).append("\n");
            sb.append("- format: json menu draft\n");
            sb.append("- chars: ").append(currentCode.length()).append("\n");
            sb.append("- lines: ").append(countLines(currentCode)).append("\n");
            sb.append("Use this as the primary menu tree to patch. Preserve unrelated nodes, triggers, table fields, ids and parent relationships unless the user explicitly requests structural changes.\n");
            sb.append("Current menu draft context:\n");
            sb.append("```json\n");
            sb.append(contextualCode).append("\n");
            sb.append("```\n\n");
            return sb.toString();
        }

        sb.append("ACTIVE FILE IN EDITOR (authoritative working buffer)\n");
        sb.append("- file_key: ").append(normalizedPName.isEmpty() ? "(unsaved or not selected)" : normalizedPName).append("\n");
        sb.append("- language: ").append(normalizedLanguage).append("\n");
        sb.append("- chars: ").append(currentCode.length()).append("\n");
        sb.append("- lines: ").append(countLines(currentCode)).append("\n");
        sb.append("Treat this editor buffer as the primary source of truth unless the user explicitly asks to compare with attachments.\n");
        sb.append("Current code context (").append(normalizedLanguage).append("):\n");
        sb.append("```").append(normalizedLanguage).append("\n");
        sb.append(contextualCode).append("\n");
        sb.append("```\n\n");
        return sb.toString();
    }

    private String buildAiAssistantAttachmentContextBlock(
            String message,
            List<Map<String, Object>> attachments,
            String contextType,
            String language,
            String responseMode) {
        if (attachments == null || attachments.isEmpty()) {
            return "";
        }

        String normalizedContext = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase();
        boolean analyzeMode = "analyze".equalsIgnoreCase(String.valueOf(responseMode == null ? "" : responseMode).trim());
        StringBuilder sb = new StringBuilder();
        sb.append("Attached context inventory:\n");
        int idx = 1;
        for (Map<String, Object> attachment : attachments) {
            if (attachment == null) {
                continue;
            }
            String kind = String.valueOf(attachment.getOrDefault("kind", "file")).trim();
            String name = String.valueOf(attachment.getOrDefault("name", "attachment")).trim();
            String mimeType = String.valueOf(attachment.getOrDefault("mimeType", "")).trim();
            String summary = String.valueOf(attachment.getOrDefault("summary", "")).trim();
            sb.append("- [").append(idx++).append("] ").append(kind).append(": ").append(name);
            if (!mimeType.isEmpty()) {
                sb.append(" (").append(mimeType).append(")");
            }
            if (!summary.isEmpty()) {
                sb.append(" -> ").append(summary);
            }
            sb.append("\n");
        }

        String structuredPack;
        if ("menu_json".equals(normalizedContext)) {
            structuredPack = buildMenuAttachmentContextPack(message, attachments);
        } else if (analyzeMode) {
            structuredPack = "";
        } else {
            structuredPack = buildCodeAttachmentContextPack(message, attachments, language);
        }
        if (!structuredPack.isBlank()) {
            sb.append("\n").append(structuredPack).append("\n");
            return sb.append("\n").toString();
        }

        AiAssistantAttachmentRetrievalResult retrieval = buildAiAssistantRelevantAttachmentContextResult(message, attachments);
        if (!retrieval.context.isBlank()) {
            sb.append("\nAuto-retrieved relevant excerpts from text attachments:\n");
            int retrievalCap = analyzeMode && "code".equals(normalizedContext) ? 18000 : 36000;
            sb.append(truncateMiddle(retrieval.context, retrievalCap)).append("\n\n");
        } else {
            sb.append("\n");
        }
        return sb.toString();
    }

    private String buildMenuAttachmentContextPack(String message, List<Map<String, Object>> attachments) {
        List<String> requirementSections = new ArrayList<>();
        List<String> legacyJsonSections = new ArrayList<>();
        List<String> logicSections = new ArrayList<>();

        for (Map<String, Object> attachment : attachments) {
            String body = extractTextAttachmentBody(attachment, message, "menu_json");
            if (body.isBlank()) {
                continue;
            }
            String name = String.valueOf(attachment.getOrDefault("name", "attachment")).trim();
            String mimeType = String.valueOf(attachment.getOrDefault("mimeType", "")).trim();
            String section = renderAttachmentSection(name, mimeType, attachment, body);
            String contextRole = resolveAttachmentContextRole(attachment, name, mimeType, "menu_json");
            if ("system_requirement".equals(contextRole) || isAiAssistantMarkdownLikeAttachment(name, mimeType)) {
                requirementSections.add(section);
            } else if ("legacy_json".equals(contextRole) || isAiAssistantJsonLikeAttachment(name, mimeType)) {
                legacyJsonSections.add(section);
            } else if ("business_logic".equals(contextRole) || isAiAssistantCodeLikeAttachment(name, mimeType)) {
                logicSections.add(section);
            }
        }

        StringBuilder sb = new StringBuilder();
        if (!requirementSections.isEmpty()) {
            sb.append("HIGH PRIORITY SYSTEM / CUSTOMER REQUIREMENT FILES\n");
            sb.append("Use these documents as business constraints and system contracts when designing or patching menu JSON.\n\n");
            sb.append(String.join("\n\n", requirementSections)).append("\n\n");
        }
        if (!legacyJsonSections.isEmpty()) {
            sb.append("AUTHORITATIVE LEGACY MENU / JSON REFERENCES\n");
            sb.append("Preserve entities, trigger behavior, table fields and business structure from these JSON sources unless the user explicitly requests removal or migration.\n\n");
            sb.append(String.join("\n\n", legacyJsonSections)).append("\n\n");
        }
        if (!logicSections.isEmpty()) {
            sb.append("BUSINESS LOGIC / IMPLEMENTATION REFERENCES\n");
            sb.append("Use these source files to infer workflow rules, trigger semantics, naming conventions and hidden business requirements behind the menu.\n\n");
            sb.append(String.join("\n\n", logicSections)).append("\n\n");
        }

        return trimAiAssistantCodeContext(sb.toString(), AI_ASSISTANT_MENU_ATTACHMENT_CONTEXT_MAX_CHARS).trim();
    }

    private String buildCodeAttachmentContextPack(String message, List<Map<String, Object>> attachments, String language) {
        List<String> requirementSections = new ArrayList<>();
        List<String> referenceSections = new ArrayList<>();

        for (Map<String, Object> attachment : attachments) {
            String body = extractTextAttachmentBody(attachment, message, "code");
            if (body.isBlank()) {
                continue;
            }
            String name = String.valueOf(attachment.getOrDefault("name", "attachment")).trim();
            String mimeType = String.valueOf(attachment.getOrDefault("mimeType", "")).trim();
            String section = renderAttachmentSection(name, mimeType, attachment, body);
            String contextRole = resolveAttachmentContextRole(attachment, name, mimeType, "code");
            if ("system_requirement".equals(contextRole) || isAiAssistantMarkdownLikeAttachment(name, mimeType)) {
                requirementSections.add(section);
            } else if ("reference_code".equals(contextRole)
                || "business_logic".equals(contextRole)
                || "legacy_json".equals(contextRole)
                || isAiAssistantCodeLikeAttachment(name, mimeType)
                || isAiAssistantJsonLikeAttachment(name, mimeType)) {
                referenceSections.add(section);
            }
        }

        StringBuilder sb = new StringBuilder();
        if (!requirementSections.isEmpty()) {
            sb.append("REQUIREMENT / SYSTEM DOC REFERENCES\n");
            sb.append("Use these notes as constraints, acceptance criteria and system behavior rules for the coding task.\n\n");
            sb.append(String.join("\n\n", requirementSections)).append("\n\n");
        }
        if (!referenceSections.isEmpty()) {
            sb.append("REFERENCE FILES RELATED TO CURRENT CODING TASK\n");
            sb.append("Use these files to understand APIs, data shape, surrounding logic and integration points before proposing edits.\n\n");
            sb.append(String.join("\n\n", referenceSections)).append("\n\n");
        }

        String pack = trimAiAssistantCodeContext(sb.toString(), AI_ASSISTANT_CODE_ATTACHMENT_CONTEXT_MAX_CHARS).trim();
        if (pack.isBlank()) {
            AiAssistantAttachmentRetrievalResult retrieval = buildAiAssistantRelevantAttachmentContextResult(message, attachments);
            if (!retrieval.context.isBlank()) {
                return "AUTO-RETRIEVED RELEVANT EXCERPTS\n" + retrieval.context.trim();
            }
        }
        return pack;
    }

    private String extractTextAttachmentBody(Map<String, Object> attachment, String message, String contextType) {
        if (attachment == null || attachment.isEmpty()) {
            return "";
        }
        String kind = String.valueOf(attachment.getOrDefault("kind", "")).trim().toLowerCase();
        if (!("text".equals(kind) || "json".equals(kind))) {
            return "";
        }
        String textContent = String.valueOf(attachment.getOrDefault("textContent", "")).trim();
        if (textContent.isEmpty()) {
            return "";
        }
        String name = String.valueOf(attachment.getOrDefault("name", "attachment")).trim();
        String mimeType = String.valueOf(attachment.getOrDefault("mimeType", "")).trim();
        String contextRole = resolveAttachmentContextRole(attachment, name, mimeType, contextType);

        // DATA DISTILLATION: for large JSON attachments in menu_json context, distill instead of truncate
        boolean isMenuContext = "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType).trim());
        boolean isJsonAttachment = isAiAssistantJsonLikeAttachment(name, mimeType) || "legacy_json".equals(contextRole) || "json".equals(kind);
        int distillThreshold = Math.max(20000, aiAssistantMenuDistillThresholdChars);
        if (isMenuContext && isJsonAttachment && aiAssistantMenuDistillLargeJson && textContent.length() > distillThreshold) {
            try {
                String distilled = aiAssistantMemoryManagerService.distillJsonForMenu(name, textContent);
                if (!distilled.isBlank()) {
                    logger.info("AI Assistant attachment distillation: {} chars→{} chars for {}", textContent.length(), distilled.length(), name);
                    return distilled;
                }
            } catch (Exception ex) {
                logger.warn("AI Assistant attachment distillation error for {}: {} — using truncation", name, ex.getMessage());
            }
        }

        if ("system_requirement".equals(contextRole)
            || "legacy_json".equals(contextRole)
            || isAiAssistantJsonLikeAttachment(name, mimeType)
            || isAiAssistantMarkdownLikeAttachment(name, mimeType)) {
            return trimAiAssistantCodeContext(textContent, Math.min(AI_ASSISTANT_MENU_ATTACHMENT_CONTEXT_MAX_CHARS / 2, 90000));
        }
        if ("business_logic".equals(contextRole)
            || "reference_code".equals(contextRole)
            || isAiAssistantCodeLikeAttachment(name, mimeType)) {
            String inferredLanguage = inferAiAssistantAttachmentLanguage(name, mimeType, contextType);
            return buildAiAssistantCurrentCodeContext(textContent, message, "code", inferredLanguage);
        }
        return trimAiAssistantCodeContext(textContent, 24000);
    }

    private String renderAttachmentSection(String name, String mimeType, Map<String, Object> attachment, String body) {
        String summary = String.valueOf(attachment.getOrDefault("summary", "")).trim();
        String contextRole = String.valueOf(attachment.getOrDefault("contextRole", "")).trim();
        boolean authoritative = Boolean.parseBoolean(String.valueOf(attachment.getOrDefault("authoritative", "false")));
        StringBuilder sb = new StringBuilder();
        sb.append("### ").append(name.isEmpty() ? "attachment" : name).append("\n");
        if (!mimeType.isEmpty()) {
            sb.append("- mime_type: ").append(mimeType).append("\n");
        }
        if (!contextRole.isEmpty()) {
            sb.append("- context_role: ").append(contextRole).append("\n");
        }
        sb.append("- authoritative: ").append(authoritative).append("\n");
        if (!summary.isEmpty()) {
            sb.append("- summary: ").append(summary).append("\n");
        }
        sb.append("```\n");
        sb.append(body).append("\n");
        sb.append("```");
        return sb.toString();
    }

    private boolean isAiAssistantMarkdownLikeAttachment(String name, String mimeType) {
        String normalizedName = String.valueOf(name == null ? "" : name).trim().toLowerCase();
        String normalizedMimeType = String.valueOf(mimeType == null ? "" : mimeType).trim().toLowerCase();
        return normalizedMimeType.contains("markdown")
            || normalizedName.endsWith(".md")
            || normalizedName.endsWith(".markdown")
            || normalizedName.endsWith(".txt")
            || normalizedName.contains("prompt")
            || normalizedName.contains("requirement")
            || normalizedName.contains("spec")
            || normalizedName.contains("architecture")
            || normalizedName.contains("system");
    }

    private boolean isAiAssistantJsonLikeAttachment(String name, String mimeType) {
        String normalizedName = String.valueOf(name == null ? "" : name).trim().toLowerCase();
        String normalizedMimeType = String.valueOf(mimeType == null ? "" : mimeType).trim().toLowerCase();
        return normalizedMimeType.contains("json")
            || normalizedName.endsWith(".json")
            || normalizedName.startsWith("untitled-");
    }

    private String resolveAttachmentContextRole(Map<String, Object> attachment, String name, String mimeType, String contextType) {
        String explicit = String.valueOf(attachment == null ? "" : attachment.getOrDefault("contextRole", "")).trim().toLowerCase();
        if (!explicit.isEmpty()) {
            return explicit;
        }
        if (isAiAssistantMarkdownLikeAttachment(name, mimeType)) {
            return "system_requirement";
        }
        if (isAiAssistantJsonLikeAttachment(name, mimeType)) {
            return "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType).trim())
                ? "legacy_json"
                : "reference_code";
        }
        if (isAiAssistantCodeLikeAttachment(name, mimeType)) {
            return "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType).trim())
                ? "business_logic"
                : "reference_code";
        }
        return "general_text";
    }

    private String inferAiAssistantAttachmentLanguage(String name, String mimeType, String fallbackContext) {
        String normalizedName = String.valueOf(name == null ? "" : name).trim().toLowerCase();
        String normalizedMimeType = String.valueOf(mimeType == null ? "" : mimeType).trim().toLowerCase();
        if (normalizedName.endsWith(".java") || normalizedMimeType.contains("java")) return "java";
        if (normalizedName.endsWith(".ts") || normalizedName.endsWith(".tsx") || normalizedMimeType.contains("typescript")) return "typescript";
        if (normalizedName.endsWith(".js") || normalizedName.endsWith(".jsx") || normalizedMimeType.contains("javascript")) return "javascript";
        if (normalizedName.endsWith(".sql") || normalizedMimeType.contains("sql")) return "sql";
        if (normalizedName.endsWith(".html") || normalizedMimeType.contains("html")) return "html";
        if (normalizedName.endsWith(".css") || normalizedName.endsWith(".scss") || normalizedName.endsWith(".less") || normalizedMimeType.contains("css")) return "css";
        if (normalizedName.endsWith(".json") || normalizedMimeType.contains("json")) return "json";
        if (normalizedName.endsWith(".py") || normalizedMimeType.contains("python")) return "python";
        return "menu_json".equalsIgnoreCase(String.valueOf(fallbackContext == null ? "" : fallbackContext).trim()) ? "javascript" : "text";
    }

    private String trimAiAssistantCodeContext(String context, int hardCapChars) {
        String text = String.valueOf(context == null ? "" : context);
        int safeHardCap = Math.max(12000, hardCapChars);
        if (text.length() <= safeHardCap) {
            return text;
        }

        int keepHead = Math.max(4000, (int) Math.floor(safeHardCap * 0.7));
        int keepTail = Math.max(2000, safeHardCap - keepHead - 32);
        if (keepHead + keepTail + 32 > safeHardCap) {
            keepTail = Math.max(1200, safeHardCap - keepHead - 32);
        }

        String head = text.substring(0, Math.min(keepHead, text.length()));
        String tail = text.substring(Math.max(0, text.length() - keepTail));
        return head + "\n...[TRUNCATED_FOR_AI_ASSISTANT_CONTEXT]...\n" + tail;
    }

    private String buildAiAssistantGlobalCodeMap(String code, String language) {
        String source = String.valueOf(code == null ? "" : code);
        if (source.isBlank()) {
            return "";
        }

        int totalChars = source.length();
        int totalLines = source.split("\\r?\\n", -1).length;
        int nonEmptyLines = countNonEmptyLines(source);

        List<String> symbolLines = extractCodeSymbolLines(source, language, AI_ASSISTANT_CODE_GLOBAL_SYMBOL_MAX_ITEMS);
        List<String> anchorLines = buildCodeAnchorLines(source, AI_ASSISTANT_CODE_ANCHOR_CHARS_PER_BLOCK, AI_ASSISTANT_CODE_ANCHOR_MAX_ITEMS);

        StringBuilder sb = new StringBuilder();
        sb.append("language=").append(String.valueOf(language == null ? "" : language).trim())
            .append(", chars=").append(totalChars)
            .append(", lines=").append(totalLines)
            .append(", nonEmptyLines=").append(nonEmptyLines)
            .append("\n");

        if (!symbolLines.isEmpty()) {
            sb.append("Top symbols (from full file scan):\n");
            for (String item : symbolLines) {
                sb.append("- ").append(item).append("\n");
            }
        }

        if (!anchorLines.isEmpty()) {
            sb.append("Coverage anchors (use these to reference deep regions):\n");
            for (String item : anchorLines) {
                sb.append("- ").append(item).append("\n");
            }
        }

        return trimAiAssistantCodeContext(sb.toString(), AI_ASSISTANT_CODE_GLOBAL_MAP_MAX_CHARS);
    }

    private int countNonEmptyLines(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        int count = 0;
        String[] lines = text.split("\\r?\\n", -1);
        for (String line : lines) {
            if (line != null && !line.trim().isEmpty()) {
                count += 1;
            }
        }
        return count;
    }

    private List<String> extractCodeSymbolLines(String code, String language, int maxItems) {
        List<String> out = new ArrayList<>();
        if (code == null || code.isBlank() || maxItems <= 0) {
            return out;
        }

        List<Pattern> patterns = List.of(
            Pattern.compile("(?m)^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+([A-Za-z_$][\\w$]*)\\s*\\("),
            Pattern.compile("(?m)^\\s*(?:export\\s+)?class\\s+([A-Za-z_$][\\w$]*)\\b"),
            Pattern.compile("(?m)^\\s*(?:export\\s+)?(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s*)?\\("),
            Pattern.compile("(?m)^\\s*(?:public|private|protected)?\\s*(?:static\\s+)?(?:final\\s+)?[A-Za-z0-9_<>\\[\\], ?]+\\s+([a-zA-Z_$][\\w$]*)\\s*\\([^;{}]*\\)\\s*\\{")
        );

        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(code);
            while (matcher.find()) {
                String symbol = String.valueOf(matcher.group(1) == null ? "" : matcher.group(1)).trim();
                if (symbol.isEmpty()) {
                    continue;
                }
                int line = estimateLineAt(code, matcher.start());
                String item = symbol + " (line " + line + ")";
                if (!out.contains(item)) {
                    out.add(item);
                }
                if (out.size() >= maxItems) {
                    return out;
                }
            }
        }

        // Fallback: include first meaningful declaration-like lines when regex symbols are scarce.
        if (out.size() < Math.min(12, maxItems)) {
            String[] lines = code.split("\\r?\\n");
            for (int i = 0; i < lines.length; i++) {
                String line = String.valueOf(lines[i] == null ? "" : lines[i]).trim();
                if (line.isEmpty() || line.length() < 8) {
                    continue;
                }
                if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
                    continue;
                }
                if (!(line.contains("function") || line.startsWith("class ") || line.startsWith("export ")
                    || line.startsWith("const ") || line.startsWith("let ") || line.startsWith("var ")
                    || line.contains("=>") || line.contains("("))) {
                    continue;
                }
                String compact = line.length() > 140 ? line.substring(0, 140) + "..." : line;
                String fallbackItem = compact + " (line " + (i + 1) + ")";
                if (!out.contains(fallbackItem)) {
                    out.add(fallbackItem);
                }
                if (out.size() >= maxItems) {
                    break;
                }
            }
        }

        return out;
    }

    private int estimateLineAt(String text, int charIndex) {
        if (text == null || text.isEmpty()) {
            return 1;
        }
        int safeIndex = Math.max(0, Math.min(charIndex, text.length()));
        int line = 1;
        for (int i = 0; i < safeIndex; i++) {
            if (text.charAt(i) == '\n') {
                line += 1;
            }
        }
        return line;
    }

    private List<String> buildCodeAnchorLines(String code, int chunkChars, int maxItems) {
        List<String> anchors = new ArrayList<>();
        if (code == null || code.isBlank() || chunkChars <= 0 || maxItems <= 0) {
            return anchors;
        }

        int total = code.length();
        int cursor = 0;
        int idx = 1;
        while (cursor < total && anchors.size() < maxItems) {
            int end = Math.min(total, cursor + chunkChars);
            int startLine = estimateLineAt(code, cursor);
            int endLine = estimateLineAt(code, Math.max(cursor, end - 1));
            String preview = code.substring(cursor, Math.min(end, cursor + 200))
                .replace("\r", " ")
                .replace("\n", " ")
                .replaceAll("\\s+", " ")
                .trim();
            if (preview.length() > 120) {
                preview = preview.substring(0, 120) + "...";
            }
            anchors.add("A" + idx + ": chars " + (cursor + 1) + "-" + end
                + ", lines " + startLine + "-" + endLine
                + (preview.isEmpty() ? "" : ", starts: " + preview));
            cursor = end;
            idx += 1;
        }
        return anchors;
    }

    private List<String> buildCodeDistributedCoverageExcerpts(String code, int maxItems, int excerptChars) {
        List<String> out = new ArrayList<>();
        if (code == null || code.isBlank() || maxItems <= 0 || excerptChars <= 0) {
            return out;
        }
        int total = code.length();
        int items = Math.max(2, maxItems);
        int safeExcerpt = Math.max(500, excerptChars);

        for (int i = 0; i < items; i++) {
            long numerator = (long) i * Math.max(1L, (long) total - safeExcerpt);
            int start = (int) (numerator / Math.max(1, items - 1));
            int end = Math.min(total, start + safeExcerpt);
            if (end <= start) {
                continue;
            }
            int startLine = estimateLineAt(code, start);
            int endLine = estimateLineAt(code, Math.max(start, end - 1));
            String chunk = code.substring(start, end);
            out.add("/* lines " + startLine + "-" + endLine + " */\n" + chunk);
        }
        return out;
    }

    private List<String> buildAiAssistantFocusExcerpts(String code, String message, int focusWindowChars) {
        List<String> excerpts = new ArrayList<>();
        if (message == null || message.isBlank() || code == null || code.isBlank()) {
            return excerpts;
        }

        String normalizedMessage = normalizeSearchText(message);
        if (normalizedMessage.isBlank()) {
            return excerpts;
        }

        Set<String> stopWords = Set.of(
            "code", "file", "line", "help", "please", "bug", "fix", "error",
            "menu", "json", "java", "javascript", "typescript", "react", "component",
            "toi", "ban", "giup", "minh", "sua", "dong", "loi"
        );

        String[] rawTokens = normalizedMessage.split("\\s+");
        List<String> tokens = new ArrayList<>();
        for (String raw : rawTokens) {
            String token = String.valueOf(raw == null ? "" : raw).trim().toLowerCase();
            if (token.length() < 4 || stopWords.contains(token)) {
                continue;
            }
            if (!tokens.contains(token)) {
                tokens.add(token);
            }
            if (tokens.size() >= 12) {
                break;
            }
        }

        if (tokens.isEmpty()) {
            return excerpts;
        }

        String lowerCode = code.toLowerCase();
        List<Integer> anchors = new ArrayList<>();
        for (String token : tokens) {
            int idx = lowerCode.indexOf(token);
            if (idx < 0) {
                continue;
            }
            if (isNearExistingAnchor(anchors, idx, Math.max(1200, focusWindowChars / 3))) {
                continue;
            }
            anchors.add(idx);
            int safeWindow = Math.max(4000, focusWindowChars);
            int half = Math.max(1000, safeWindow / 2);
            int start = Math.max(0, idx - half);
            int end = Math.min(code.length(), start + safeWindow);
            int startLine = estimateLineAt(code, start);
            int endLine = estimateLineAt(code, Math.max(start, end - 1));
            String excerpt = code.substring(start, end);
            excerpts.add("/* lines " + startLine + "-" + endLine + " */\n" + excerpt);
            if (excerpts.size() >= AI_ASSISTANT_CODE_FOCUS_EXCERPT_MAX_ITEMS) {
                break;
            }
        }

        return excerpts;
    }

    private String normalizeSearchText(String raw) {
        return Normalizer.normalize(String.valueOf(raw == null ? "" : raw), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase()
                .replaceAll("[^a-z0-9_\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private static class AiAssistantAttachmentRetrievalResult {
        String context = "";
        int filesUsed = 0;
        int snippetsUsed = 0;
        int retrievedChars = 0;
        List<String> queryTokens = new ArrayList<>();
        List<Map<String, Object>> sources = new ArrayList<>();
    }

    private AiAssistantAttachmentRetrievalResult buildAiAssistantRelevantAttachmentContextResult(
            String message,
            List<Map<String, Object>> attachments) {
        AiAssistantAttachmentRetrievalResult result = new AiAssistantAttachmentRetrievalResult();
        if (!aiAssistantAttachmentRetrievalEnabled || attachments == null || attachments.isEmpty()) {
            return result;
        }

        int maxAttachments = Math.max(1, aiAssistantAttachmentRetrievalMaxAttachments);
        int maxSnippetsPerFile = Math.max(1, aiAssistantAttachmentRetrievalMaxSnippetsPerFile);
        int snippetWindowChars = Math.max(600, aiAssistantAttachmentRetrievalSnippetWindowChars);
        int maxTotalChars = Math.max(4000, aiAssistantAttachmentRetrievalMaxTotalChars);

        // Full-context mode limits: inject the entire file when fullContext=true or when
        // the file is a small-enough JSON/MD reference document (< threshold).
        // Separate budget so full-context files do not crowd out snippet files.
        final int FULL_CONTEXT_PER_FILE_LIMIT = 200_000;   // chars per full-context file
        final int FULL_CONTEXT_BUDGET_TOTAL   = 400_000;   // total budget for all full-context files
        int fullContextBudgetUsed = 0;

        List<String> queryTokens = extractAiAssistantRetrievalTokens(message);
        result.queryTokens = queryTokens;
        StringBuilder sbFull    = new StringBuilder(); // full-context files go first
        StringBuilder sbSnippet = new StringBuilder(); // snippet files go after

        for (Map<String, Object> attachment : attachments) {
            if (attachment == null || attachment.isEmpty()) {
                continue;
            }

            String kind = String.valueOf(attachment.getOrDefault("kind", "")).trim().toLowerCase();
            if (!("text".equals(kind) || "json".equals(kind))) {
                continue;
            }

            String name = String.valueOf(attachment.getOrDefault("name", "attachment")).trim();
            if (name.isEmpty()) name = "attachment";

            String textContent = String.valueOf(attachment.getOrDefault("textContent", "")).trim();
            if (textContent.isEmpty()) continue;

            // ── Full-context mode: attach entire file ──────────────────────────
            // Triggered by either:
            //   a) Frontend sets fullContext=true on the attachment
            //   b) Small JSON/MD reference file (≤ 80K chars)
            boolean explicitFull = Boolean.TRUE.equals(attachment.get("fullContext"));
            boolean authoritative = Boolean.TRUE.equals(attachment.get("authoritative"));
            boolean autoFull = (textContent.length() <= 80_000)
                && ("json".equals(kind)
                    || name.toLowerCase().endsWith(".md")
                    || name.toLowerCase().endsWith(".json")
                    || isAiAssistantCodeLikeAttachment(name, String.valueOf(attachment.getOrDefault("mimeType", ""))));

            if ((explicitFull || authoritative || autoFull) && fullContextBudgetUsed < FULL_CONTEXT_BUDGET_TOTAL) {
                int allowed = Math.min(FULL_CONTEXT_PER_FILE_LIMIT, FULL_CONTEXT_BUDGET_TOTAL - fullContextBudgetUsed);
                String body = textContent.length() <= allowed
                    ? textContent
                    : textContent.substring(0, allowed) + "\n...[FILE TRUNCATED — first " + allowed + " chars shown]";
                sbFull.append("=== FULL CONTEXT FILE: ").append(name)
                      .append(" (chars=").append(textContent.length()).append(") ===\n");
                sbFull.append("```\n").append(body).append("\n```\n\n");
                fullContextBudgetUsed += body.length();

                Map<String, Object> sourceMeta = new LinkedHashMap<>();
                sourceMeta.put("name", name);
                sourceMeta.put("kind", kind);
                sourceMeta.put("chars", textContent.length());
                sourceMeta.put("mode", "full");
                result.sources.add(sourceMeta);
                result.filesUsed += 1;
                result.snippetsUsed += 1;
                result.retrievedChars += body.length();
                continue;
            }

            // ── Snippet-based RAG for large files ────────────────────────────
            if (result.filesUsed >= maxAttachments) continue;

            List<String> snippets = extractAttachmentSnippetsByTokens(
                textContent,
                queryTokens,
                maxSnippetsPerFile,
                snippetWindowChars);
            if (snippets.isEmpty()) {
                snippets.add(textContent.substring(0, Math.min(1200, textContent.length())));
            }

            sbSnippet.append("- Source: ").append(name)
                .append(" (chars=").append(textContent.length()).append(")\n");

            Map<String, Object> sourceMeta = new LinkedHashMap<>();
            sourceMeta.put("name", name);
            sourceMeta.put("kind", kind);
            sourceMeta.put("chars", textContent.length());
            sourceMeta.put("mode", "snippet");
            sourceMeta.put("snippets", snippets.size());
            List<Integer> snippetSizes = new ArrayList<>();

            int i = 1;
            for (String snippet : snippets) {
                if (snippet == null || snippet.isBlank()) continue;
                String cleaned = snippet.trim();
                snippetSizes.add(cleaned.length());
                sbSnippet.append("  [snippet ").append(i++).append("]\n");
                sbSnippet.append("  ```\n").append(cleaned).append("\n  ```\n");
                result.snippetsUsed += 1;
                result.retrievedChars += cleaned.length();
            }
            sourceMeta.put("snippetCharSizes", snippetSizes);
            result.sources.add(sourceMeta);
            result.filesUsed += 1;

            if (sbSnippet.length() >= maxTotalChars) break;
        }

        // Combine: full-context files first, then snippet excerpts
        String combined = sbFull.toString() + sbSnippet.toString();
        // Apply hard cap only on the snippet portion so full-context files survive
        result.context = combined.length() <= (FULL_CONTEXT_BUDGET_TOTAL + maxTotalChars)
            ? combined
            : combined.substring(0, FULL_CONTEXT_BUDGET_TOTAL + maxTotalChars);
        result.retrievedChars = result.context.length();
        return result;
    }

    private boolean isAiAssistantCodeLikeAttachment(String name, String mimeType) {
        String normalizedName = String.valueOf(name == null ? "" : name).trim().toLowerCase();
        String normalizedMimeType = String.valueOf(mimeType == null ? "" : mimeType).trim().toLowerCase();
        if (normalizedMimeType.startsWith("text/")) {
            return true;
        }
        if (normalizedMimeType.contains("json")
            || normalizedMimeType.contains("javascript")
            || normalizedMimeType.contains("typescript")
            || normalizedMimeType.contains("java")
            || normalizedMimeType.contains("xml")
            || normalizedMimeType.contains("yaml")
            || normalizedMimeType.contains("sql")) {
            return true;
        }
        return normalizedName.endsWith(".java")
            || normalizedName.endsWith(".js")
            || normalizedName.endsWith(".jsx")
            || normalizedName.endsWith(".ts")
            || normalizedName.endsWith(".tsx")
            || normalizedName.endsWith(".json")
            || normalizedName.endsWith(".md")
            || normalizedName.endsWith(".sql")
            || normalizedName.endsWith(".html")
            || normalizedName.endsWith(".css")
            || normalizedName.endsWith(".scss")
            || normalizedName.endsWith(".less")
            || normalizedName.endsWith(".xml")
            || normalizedName.endsWith(".yml")
            || normalizedName.endsWith(".yaml")
            || normalizedName.endsWith(".properties");
    }

    private List<String> extractAiAssistantRetrievalTokens(String message) {
        String normalized = normalizeSearchText(message);
        List<String> tokens = new ArrayList<>();
        if (normalized.isBlank()) {
            return tokens;
        }

        Set<String> stopWords = Set.of(
            "code", "file", "line", "help", "please", "bug", "fix", "error",
            "menu", "json", "java", "javascript", "typescript", "react", "component",
            "toi", "ban", "giup", "minh", "sua", "dong", "loi", "yeu", "cau", "khach",
            "system", "he", "thong", "api", "ai-assistant"
        );

        String[] rawTokens = normalized.split("\\s+");
        for (String raw : rawTokens) {
            String token = String.valueOf(raw == null ? "" : raw).trim().toLowerCase();
            if (token.length() < 3 || stopWords.contains(token)) {
                continue;
            }
            if (!tokens.contains(token)) {
                tokens.add(token);
            }
            if (tokens.size() >= 16) {
                break;
            }
        }

        return tokens;
    }

    private List<String> extractAttachmentSnippetsByTokens(
            String text,
            List<String> tokens,
            int maxSnippets,
            int windowChars) {
        List<String> snippets = new ArrayList<>();
        if (text == null || text.isBlank() || maxSnippets <= 0) {
            return snippets;
        }

        String source = text;
        String lower = source.toLowerCase();
        int safeWindow = Math.max(600, windowChars);
        int half = Math.max(300, safeWindow / 2);
        List<Integer> anchors = new ArrayList<>();

        if (tokens != null && !tokens.isEmpty()) {
            for (String token : tokens) {
                if (token == null || token.isBlank()) {
                    continue;
                }
                int from = 0;
                int hits = 0;
                String needle = token.toLowerCase();
                while (from < lower.length() && hits < 2 && anchors.size() < maxSnippets * 3) {
                    int idx = lower.indexOf(needle, from);
                    if (idx < 0) {
                        break;
                    }
                    if (!isNearExistingAnchor(anchors, idx, half)) {
                        anchors.add(idx);
                    }
                    from = idx + Math.max(1, needle.length());
                    hits += 1;
                }
                if (anchors.size() >= maxSnippets * 3) {
                    break;
                }
            }
        }

        if (anchors.isEmpty()) {
            return snippets;
        }

        for (int anchor : anchors) {
            int start = Math.max(0, anchor - half);
            int end = Math.min(source.length(), start + safeWindow);
            String snippet = source.substring(start, end).trim();
            if (snippet.isEmpty()) {
                continue;
            }
            if (snippet.length() > safeWindow) {
                snippet = snippet.substring(0, safeWindow);
            }
            if (!snippets.contains(snippet)) {
                snippets.add(snippet);
            }
            if (snippets.size() >= maxSnippets) {
                break;
            }
        }

        return snippets;
    }

    private boolean isNearExistingAnchor(List<Integer> anchors, int candidate, int threshold) {
        if (anchors == null || anchors.isEmpty()) {
            return false;
        }
        int safeThreshold = Math.max(120, threshold);
        for (Integer anchor : anchors) {
            if (anchor == null) {
                continue;
            }
            if (Math.abs(anchor - candidate) <= safeThreshold) {
                return true;
            }
        }
        return false;
    }

    private String normalizeAiAssistantResponseMode(Object rawMode, String message) {
        String mode = String.valueOf(rawMode == null ? "" : rawMode).trim().toLowerCase();
        if ("edit".equals(mode)) {
            return "edit";
        }
        if ("analyze".equals(mode)) {
            return "analyze";
        }
        String detected = detectAiAssistantResponseModeFromMessage(message);
        if ("edit".equals(detected) || "analyze".equals(detected)) {
            return detected;
        }
        return "analyze";
    }

    private String detectAiAssistantResponseModeFromMessage(String message) {
        if (message == null) {
            return "";
        }
        String trimmed = message.trim();
        if (!trimmed.startsWith("/")) {
            return "";
        }

        int i = 1;
        while (i < trimmed.length()) {
            char ch = trimmed.charAt(i);
            if (Character.isWhitespace(ch) || ch == ':') {
                break;
            }
            i += 1;
        }
        if (i <= 1) {
            return "";
        }

        String token = normalizeAiAssistantDirectiveToken(trimmed.substring(1, i));
        if (Set.of("edit", "apply", "sua", "chinh", "cap-nhat", "update", "modify", "bianji", "xiugai", "编辑", "修改").contains(token)) {
            return "edit";
        }
        if (Set.of("analyze", "analysis", "phan-tich", "giai-thich", "explain", "fenxi", "jieshi", "分析", "解释").contains(token)) {
            return "analyze";
        }
        return "";
    }

    private String stripAiAssistantModeDirective(String message) {
        if (message == null) {
            return "";
        }
        String trimmed = message.trim();
        String detected = detectAiAssistantResponseModeFromMessage(trimmed);
        if (detected.isEmpty()) {
            return trimmed;
        }

        int i = 1;
        while (i < trimmed.length()) {
            char ch = trimmed.charAt(i);
            if (Character.isWhitespace(ch) || ch == ':') {
                break;
            }
            i += 1;
        }
        int j = i;
        while (j < trimmed.length() && (Character.isWhitespace(trimmed.charAt(j)) || trimmed.charAt(j) == ':')) {
            j += 1;
        }
        return trimmed.substring(j).trim();
    }

    private String normalizeAiAssistantDirectiveToken(String token) {
        if (token == null) {
            return "";
        }
        return Normalizer.normalize(token.trim().toLowerCase(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replace('_', '-');
    }

    private List<Map<String, Object>> normalizeAiAssistantAttachments(Object rawAttachments) {
        List<Map<String, Object>> normalized = new ArrayList<>();
        if (!(rawAttachments instanceof List<?> rawList)) {
            return normalized;
        }

        for (Object item : rawList) {
            if (!(item instanceof Map<?, ?> rawMap)) {
                continue;
            }

            String kind = String.valueOf(rawMap.get("kind") == null ? "" : rawMap.get("kind")).trim().toLowerCase();
            String name = String.valueOf(rawMap.get("name") == null ? "attachment" : rawMap.get("name")).trim();
            String mimeType = String.valueOf(rawMap.get("mimeType") == null ? "" : rawMap.get("mimeType")).trim();
            String summary = String.valueOf(rawMap.get("summary") == null ? "" : rawMap.get("summary")).trim();
            int size = 0;
            try {
                size = Integer.parseInt(String.valueOf(rawMap.get("size") == null ? "0" : rawMap.get("size")));
            } catch (Exception ignored) {
                size = 0;
            }

            Map<String, Object> next = new HashMap<>();
            next.put("kind", kind);
            next.put("name", name.isEmpty() ? "attachment" : name);
            next.put("mimeType", mimeType);
            next.put("summary", summary);
            next.put("contextRole", String.valueOf(rawMap.get("contextRole") == null ? "" : rawMap.get("contextRole")).trim());
            next.put("authoritative", Boolean.parseBoolean(String.valueOf(rawMap.get("authoritative") == null ? "false" : rawMap.get("authoritative"))));
            next.put("size", size);

            if ("image".equals(kind)) {
                String dataUrl = String.valueOf(rawMap.get("dataUrl") == null ? "" : rawMap.get("dataUrl")).trim();
                boolean validDataUrl = dataUrl.startsWith("data:image/") || dataUrl.startsWith("http://") || dataUrl.startsWith("https://");
                if (!validDataUrl) {
                    continue;
                }
                next.put("dataUrl", dataUrl);
                normalized.add(next);
                if (normalized.size() >= 8) {
                    break;
                }
                continue;
            }

            if ("text".equals(kind) || "json".equals(kind)) {
                String textContent = String.valueOf(rawMap.get("textContent") == null ? "" : rawMap.get("textContent")).trim();
                if (textContent.isEmpty()) {
                    continue;
                }
                next.put("textContent", textContent.length() > AI_ASSISTANT_ATTACHMENT_TEXT_MAX_CHARS
                    ? textContent.substring(0, AI_ASSISTANT_ATTACHMENT_TEXT_MAX_CHARS) + "\n...[truncated]"
                    : textContent);
                normalized.add(next);
            }

            if (normalized.size() >= 8) {
                break;
            }
        }

        return normalized;
    }

    private void emitAiAssistantChatChunk(String appId, Map<String, Object> payload) {
        if (appId == null || appId.isEmpty() || socketIOServer == null) {
            return;
        }
        try {
            if (payload == null) {
                payload = new HashMap<>();
            }
            payload.put("timestamp", System.currentTimeMillis());
            socketIOServer.getRoomOperations(appId).sendEvent("aiAssistant_chat_chunk", payload);
        } catch (Exception e) {
            logger.debug("Failed to emit aiAssistant chat chunk: {}", e.getMessage());
        }
    }

    private void emitAiAssistantChatEvent(String appId, String eventName, Object payload) {
        if (appId == null || appId.isEmpty() || socketIOServer == null) {
            return;
        }
        try {
            socketIOServer.getRoomOperations(appId).sendEvent(eventName, payload);
        } catch (Exception e) {
            logger.debug("Failed to emit aiAssistant chat event {}: {}", eventName, e.getMessage());
        }
    }

    public void getObjectFromAI(StandardResponse response, Map<String, Object> params) {
        String uiLang = resolveClientUiLanguage(params);
        String mode = String.valueOf(params.getOrDefault("mode", "sync")).trim().toLowerCase();
        if ("status".equals(mode)) {
            handleAiAsyncStatus(response, params);
            return;
        }
        if ("cancel".equals(mode)) {
            handleAiAsyncCancel(response, params);
            return;
        }

        String prompt = extractPromptAsString(params);
        boolean asyncRequested = "submit".equals(mode)
                || Boolean.TRUE.equals(params.get("async"))
                || "true".equalsIgnoreCase(String.valueOf(params.get("async")));

        if (asyncRequested) {
            handleAiAsyncSubmit(response, prompt, params);
            return;
        }

        String rawContent;

        if (prompt == null || prompt.isEmpty()) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Thiếu tham số 'prompt' để tạo nội dung AI.",
                "Missing 'prompt' parameter to generate AI content.",
                "缺少用于生成 AI 内容的 'prompt' 参数。"));
            return;
        }

        // Global guardrail for request size handled by this endpoint.
        if (prompt.length() > maxPromptChars) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Prompt quá dài (tối đa " + maxPromptChars + " ký tự), hiện tại: " + prompt.length(),
                "Prompt is too long (max " + maxPromptChars + " chars), current: " + prompt.length(),
                "Prompt 过长（最大 " + maxPromptChars + " 字符），当前：" + prompt.length()));
            response.set("errorCode", "PROMPT_EXCEEDS_ENDPOINT_LIMIT");
            return;
        }

        try {
            rawContent = fetchAiRawContentWithMenuRecovery(prompt, null, params);
        } catch (RuntimeException e) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Lỗi khi tương tác với dịch vụ AI: " + e.getMessage(),
                "Error while interacting with AI service: " + e.getMessage(),
                "与 AI 服务交互时出错：" + e.getMessage()));
            logger.error("Runtime exception in AI provider: {}", e.getMessage(), e);
            return;
        }

        if (rawContent == null || rawContent.isEmpty()) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Không nhận được nội dung hợp lệ từ dịch vụ AI.",
                "No valid content received from AI service.",
                "未收到来自 AI 服务的有效内容。"));
            return;
        }

        // After a successful menu-design generation, persist the session context file
        // so the next call can continue from where this one left off — no need to re-send history.
        try {
            String promptAppId = this.aiAssistantGatewayService.extractAppIdFromPrompt(prompt);
            if (promptAppId != null && !promptAppId.isBlank()) {
                String requestText = extractRequestTextFromPrompt(prompt);
                this.aiAssistantGatewayService.updateAppContextFile(promptAppId, requestText, rawContent);
            }
        } catch (Exception ctxEx) {
            logger.warn("Could not update AI context file after generation: {}", ctxEx.getMessage());
        }

        if (shouldExposeRoutingDebug(params)) {
            Object routingDecision = params != null ? params.get("_providerRoutingDecision") : null;
            if (routingDecision != null) {
                response.set("providerRoutingDecision", routingDecision);
            }
        }

        populateAiResponseFromRawContent(response, rawContent, uiLang);
    }

    private String fetchAiRawContent(String prompt, AiAssistantGatewayService.ProgressListener progressListener, Map<String, Object> params) {
        String safePrompt = prompt == null ? "" : prompt;
        String taskTypeRaw = firstNonBlankString(
                params != null ? params.get("taskType") : null,
            params != null ? params.get("task") : null,
            extractTaskTypeFromPromptJson(safePrompt)
        );
        String taskType = taskTypeRaw == null ? "" : taskTypeRaw.toLowerCase();
        String normalizedPrompt = safePrompt.toLowerCase();
        boolean looksLikeCodingPrompt = normalizedPrompt.contains("```")
            || normalizedPrompt.contains("function ")
            || normalizedPrompt.contains("class ")
            || normalizedPrompt.contains("interface ")
            || normalizedPrompt.contains("typescript")
            || normalizedPrompt.contains("javascript")
            || normalizedPrompt.contains("java")
            || normalizedPrompt.contains("python")
            || normalizedPrompt.contains("html")
            || normalizedPrompt.contains("css")
            || normalizedPrompt.contains("sql")
            || normalizedPrompt.contains("bug")
            || normalizedPrompt.contains("refactor")
            || normalizedPrompt.contains("fix");
        boolean isMenuDesignTask = taskType.contains("menu_design");
        boolean isMenuLanguageTask = taskType.contains("menu_i18n_generate")
            || taskType.contains("menu_lang_generate")
            || taskType.contains("menu_language_generate");
        boolean isCodingTask = taskType.contains("code")
            || taskType.contains("coding")
            || taskType.contains("developer")
            || taskType.contains("editor")
            || looksLikeCodingPrompt;

        boolean menuDesignByDev = (params != null && Boolean.TRUE.equals(params.get("menuDesignByDev")))
            || "true".equalsIgnoreCase(String.valueOf(params != null ? params.get("menuDesignByDev") : null));

        // Keep verification for audit visibility, but do not gate menu-design routing on dev role.
        if (menuDesignByDev) {
            UserAuthContext context = extractUserAuthContext();
            boolean verifiedDevCaller = hasDevPrivilege(context);
            if (!verifiedDevCaller && !isMenuDesignTask) {
                logger.warn("Ignoring menuDesignByDev hint because caller is not verified as dev user");
            }
        }

        // For menu design, prefer AI Assistant API first. Fallback to Gemini is still allowed on quota/rate failures.
        boolean forceAiAssistant = (isMenuDesignTask && !isMenuLanguageTask)
            || ((preferAiAssistantForCoding || forceAiAssistantForCoding) && isCodingTask);

        boolean blockGeminiFallback = false;
        if (disableFallbackForCoding && isCodingTask) {
            blockGeminiFallback = true;
        }
        if (forceAiAssistantForCoding && isCodingTask) {
            blockGeminiFallback = true;
        }

        if (forceAiAssistant) {
            if (params != null) {
                params.put("_providerRoutingDecision", isMenuDesignTask
                    ? "forced_aiAssistant_menu_design_with_gemini_fallback"
                    : (isCodingTask && (preferAiAssistantForCoding || forceAiAssistantForCoding)
                        ? "forced_ai_assistant_for_coding"
                        : "forced_aiAssistant_by_preference"));
            }
            if (progressListener != null) {
                progressListener.onProgress(createAiJobProgress("ai_assistant", "Đang gọi AI Assistant API (ưu tiên theo yêu cầu)", 0, 1, null));
            }

            String githubRaw = this.aiAssistantGatewayService.generateContent(safePrompt, progressListener);
            boolean rateOrQuotaFailure = shouldFallbackToGemini(githubRaw);
            boolean hardQuotaFailure = isHardQuotaFailure(githubRaw);
            boolean allowGeminiFallback = !blockGeminiFallback || hardQuotaFailure;
            if (rateOrQuotaFailure && allowGeminiFallback) {
                logger.warn("AI Assistant API hit quota/rate limit. Auto fallback to Gemini provider flow.");
                if (progressListener != null) {
                    String fallbackMsg = hardQuotaFailure
                        ? "AI Assistant API hết daily quota, đang chuyển sang Gemini"
                        : "AI Assistant API hết quota, đang chuyển sang Gemini";
                    progressListener.onProgress(createAiJobProgress("gemini_fallback", fallbackMsg, 0, 1, null));
                }
                return this.aiProviderFactory.generateContent(safePrompt);
            } else if (rateOrQuotaFailure && blockGeminiFallback) {
                logger.warn("AI Assistant API hit quota/rate limit but Gemini fallback is disabled for this request.");
            }
            return githubRaw;
        }

        if (safePrompt.length() > geminiMaxPromptChars) {
            if (isMenuLanguageTask) {
                if (params != null) {
                    params.put("_providerRoutingDecision", "menu_i18n_reject_prompt_too_large_no_aiAssistant");
                }
                logger.warn("Menu i18n task prompt exceeded Gemini limit ({}>{}) chars. Rejecting without AI Assistant fallback.",
                        safePrompt.length(), geminiMaxPromptChars);
                return "{\"success\":false,\"provider\":\"Gemini\",\"errorCode\":\"GEMINI_PROMPT_TOO_LARGE\",\"message\":\"Prompt quá lớn cho Gemini (tối đa "
                        + geminiMaxPromptChars + " ký tự): " + safePrompt.length() + "\"}";
            }
            if (params != null) {
                params.put("_providerRoutingDecision", "fallback_aiAssistant_prompt_size");
            }
            logger.warn("Prompt size exceeded Gemini limit ({}>{}) chars. Routing to AI Assistant API fallback.",
                    safePrompt.length(), geminiMaxPromptChars);
            if (progressListener != null) {
                progressListener.onProgress(createAiJobProgress("ai_assistant", "Đang gọi AI Assistant API", 0, 1, null));
            }

            String githubRaw = this.aiAssistantGatewayService.generateContent(safePrompt, progressListener);
            if (shouldFallbackToGemini(githubRaw)) {
                logger.warn("AI Assistant API hit quota/rate limit. Auto fallback to Gemini provider flow.");
                if (progressListener != null) {
                    progressListener.onProgress(createAiJobProgress("gemini_fallback", "AI Assistant API hết quota, đang chuyển sang Gemini", 0, 1, null));
                }
                return this.aiProviderFactory.generateContent(safePrompt);
            }
            return githubRaw;
        }

        if (params != null) {
            params.put("_providerRoutingDecision", "gemini_first_default");
        }
        if (progressListener != null) {
            progressListener.onProgress(createAiJobProgress("gemini", "Đang gọi Gemini", 0, 1, null));
        }
        return this.aiProviderFactory.generateContent(safePrompt);
    }

    private String fetchAiRawContentWithMenuRecovery(
            String prompt,
            AiAssistantGatewayService.ProgressListener progressListener,
            Map<String, Object> params) {
        String safePrompt = String.valueOf(prompt == null ? "" : prompt);
        boolean runMenuRecovery = shouldRunMenuAutoContinue(safePrompt, params);

        if (runMenuRecovery && progressListener != null) {
            Map<String, Object> phaseMeta = new HashMap<>();
            phaseMeta.put("phase", "phase_0_local_enrichment");
            phaseMeta.put("step", "Xử lý cục bộ không cần API");
            progressListener.onProgress(createAiJobProgress(
                "phase_0_local_enrichment",
                "Pha 0/3: Xử lý cục bộ để giảm chi phí API",
                0,
                3,
                phaseMeta));
        }

        // PHASE 0: Local Translation Enrichment (No API cost)
        long phase0Start = System.currentTimeMillis();
        try {
            String localEnrichedJson = applyLocalEnrichmentToMenuJson(safePrompt);
            long phase0Duration = System.currentTimeMillis() - phase0Start;
            
            if (progressListener != null) {
                Map<String, Object> meta = new HashMap<>();
                meta.put("phase", "phase_0_local_enrichment");
                meta.put("durationMs", phase0Duration);
                meta.put("method", "local_heuristic");
                progressListener.onProgress(createAiJobProgress(
                    "phase_0_local_enrichment_completed",
                    "Pha 0/3 hoàn tất: Đã bổ sung translations cục bộ",
                    1,
                    3,
                    meta));
            }

            apiCallInstrumentationService.recordLocalTranslation("menu_local_enrichment", 1, phase0Duration);
            
            // Use locally enriched JSON for further processing
            safePrompt = localEnrichedJson;
        } catch (Exception e) {
            logger.debug("Local enrichment failed, falling back to full AI", e);
            apiCallInstrumentationService.recordLocalTranslation("menu_local_enrichment_failed", 0, 
                System.currentTimeMillis() - phase0Start);
        }

        if (runMenuRecovery && progressListener != null) {
            Map<String, Object> phaseMeta = new HashMap<>();
            phaseMeta.put("phase", "phase_1_generate");
            phaseMeta.put("attempt", 1);
            phaseMeta.put("maxAttempts", Math.max(1, aiMenuAutoContinueMaxAttempts));
            progressListener.onProgress(createAiJobProgress(
                "phase_1_generate",
                "Pha 1/3: Đang sinh kết quả menu ban đầu",
                1,
                3,
                phaseMeta));
        }

        String initialRaw = fetchAiRawContent(safePrompt, progressListener, params);

        if (!runMenuRecovery) {
            return initialRaw;
        }

        String latestRaw = initialRaw;
        int maxAttempts = Math.max(1, aiMenuAutoContinueMaxAttempts);
        if (isValidMenuOutputPayload(latestRaw)) {
            if (progressListener != null) {
                Map<String, Object> doneMeta = new HashMap<>();
                doneMeta.put("phase", "phase_1_generate");
                doneMeta.put("attempt", 1);
                doneMeta.put("maxAttempts", maxAttempts);
                doneMeta.put("result", "valid_menu_json");
                progressListener.onProgress(createAiJobProgress(
                    "phase_1_generate_completed",
                    "Pha 1/3 hoàn tất: kết quả đã đủ và hợp lệ",
                    2,
                    3,
                    doneMeta));
            }
            // Phase 3: Check for missing language fields
            return runPhase3LanguageFill(latestRaw, safePrompt, progressListener);
        }

        for (int attempt = 1; attempt < maxAttempts; attempt++) {
            String previousText = extractAiResultText(latestRaw);
            if (progressListener != null) {
                Map<String, Object> meta = new HashMap<>();
                meta.put("phase", "phase_2_finalize");
                meta.put("attempt", attempt + 1);
                meta.put("maxAttempts", maxAttempts);
                meta.put("reason", "menu_output_incomplete_or_invalid_json");
                progressListener.onProgress(createAiJobProgress(
                    "phase_2_finalize",
                    "Pha 2/3: Kết quả chưa hoàn chỉnh, đang tự động hoàn thiện JSON cuối",
                    1,
                    3,
                    meta));
            }

            String continuationPrompt = buildMenuAutoContinuePrompt(safePrompt, previousText, attempt + 1, maxAttempts);
            Map<String, Object> nextParams = params == null ? new HashMap<>() : new HashMap<>(params);
            nextParams.put("_menuAutoContinueAttempt", attempt + 1);
            String continuedRaw = fetchAiRawContent(continuationPrompt, progressListener, nextParams);
            if (continuedRaw == null || continuedRaw.isBlank()) {
                break;
            }
            latestRaw = continuedRaw;

            if (isValidMenuOutputPayload(latestRaw)) {
                if (progressListener != null) {
                    Map<String, Object> doneMeta = new HashMap<>();
                    doneMeta.put("phase", "phase_2_finalize");
                    doneMeta.put("attempt", attempt + 1);
                    doneMeta.put("maxAttempts", maxAttempts);
                    doneMeta.put("result", "valid_menu_json");
                    progressListener.onProgress(createAiJobProgress(
                        "phase_2_finalize_completed",
                        "Pha 2/3 hoàn tất: đã tự động khôi phục output đầy đủ",
                        2,
                        3,
                        doneMeta));
                }
                // Phase 3: Check for missing language fields
                return runPhase3LanguageFill(latestRaw, safePrompt, progressListener);
            }
        }

        if (progressListener != null) {
            Map<String, Object> failedMeta = new HashMap<>();
            failedMeta.put("phase", "phase_2_finalize");
            failedMeta.put("maxAttempts", maxAttempts);
            failedMeta.put("result", "still_invalid_or_incomplete");
            progressListener.onProgress(createAiJobProgress(
                "phase_2_finalize_failed",
                "Pha 2/3 chưa khôi phục đủ JSON hợp lệ, trả về kết quả tốt nhất hiện có",
                2,
                3,
                failedMeta));
        }

        return latestRaw;
    }

    private String applyLocalEnrichmentToMenuJson(String prompt) {
        // Extract JSON from prompt
        String text = extractAiResultText(prompt);
        if (text == null || text.isBlank()) {
            return prompt;
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = objectMapper.readValue(text, Map.class);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> menus = (List<Map<String, Object>>) root.get("menu");
            if (menus == null) {
                return prompt;
            }

            // Apply local translation to all menu items
            for (Map<String, Object> menuItem : menus) {
                localTranslationService.enrichMenuItemWithLocalTranslation(menuItem);
            }

            // Rebuild JSON
            String enrichedJson = objectMapper.writeValueAsString(root);
            // Replace in prompt (try to find where JSON starts)
            int jsonStartIdx = prompt.indexOf('{');
            if (jsonStartIdx > 0) {
                return prompt.substring(0, jsonStartIdx) + enrichedJson;
            }
            return enrichedJson;
        } catch (Exception e) {
            logger.debug("Failed to apply local enrichment", e);
            return prompt;
        }
    }

    private String runPhase3LanguageFill(
            String currentOutput,
            String originalPrompt,
            AiAssistantGatewayService.ProgressListener progressListener) {
        Set<String> missingFields = detectMissingLanguageFields(currentOutput);
        if (missingFields == null || missingFields.isEmpty()) {
            // No missing languages, return as-is
            return currentOutput;
        }

        if (progressListener != null) {
            Map<String, Object> meta = new HashMap<>();
            meta.put("phase", "phase_3_fill_missing");
            meta.put("missingCount", missingFields.size());
            progressListener.onProgress(createAiJobProgress(
                "phase_3_fill_missing",
                "Pha 3/3: Tự động bổ sung bản dịch tiếng Anh và Trung Quốc",
                1,
                3,
                meta));
        }

        String fillPrompt = buildLanguageFillPrompt(originalPrompt, currentOutput, missingFields);
        Map<String, Object> params = new HashMap<>();
        params.put("taskType", "menu_language_fill");
        params.put("_phase3LanguageFill", true);

        String filledRaw = fetchAiRawContent(fillPrompt, progressListener, params);

        if (isValidMenuOutputPayload(filledRaw)) {
            Set<String> stillMissing = detectMissingLanguageFields(filledRaw);
            if (progressListener != null) {
                Map<String, Object> meta = new HashMap<>();
                meta.put("phase", "phase_3_fill_missing");
                meta.put("result", "completed_with_languages");
                meta.put("missingSolvedCount", missingFields.size() - (stillMissing == null ? 0 : stillMissing.size()));
                progressListener.onProgress(createAiJobProgress(
                    "phase_3_fill_missing_completed",
                    "Pha 3/3 hoàn tất: Đã bổ sung đầy đủ các bản dịch",
                    3,
                    3,
                    meta));
            }
            return filledRaw;
        }

        if (progressListener != null) {
            Map<String, Object> meta = new HashMap<>();
            meta.put("phase", "phase_3_fill_missing");
            meta.put("result", "failed_to_fill_languages");
            meta.put("fallback", "returning_phase_2_output");
            progressListener.onProgress(createAiJobProgress(
                "phase_3_fill_missing_failed",
                "Pha 3/3 thất bại: Trả về output từ pha 2",
                3,
                3,
                meta));
        }

        return currentOutput;
    }

    private boolean shouldRunMenuAutoContinue(String prompt, Map<String, Object> params) {
        if (!aiMenuAutoContinueEnabled) {
            return false;
        }
        String safePrompt = String.valueOf(prompt == null ? "" : prompt);
        if (safePrompt.isBlank()) {
            return false;
        }
        String taskTypeRaw = firstNonBlankString(
            params != null ? params.get("taskType") : null,
            params != null ? params.get("task") : null,
            extractTaskTypeFromPromptJson(safePrompt));
        String taskType = String.valueOf(taskTypeRaw == null ? "" : taskTypeRaw).toLowerCase();
        boolean isMenuTask = taskType.contains("menu_design")
            || taskType.contains("menu_i18n")
            || taskType.contains("menu_lang")
            || taskType.contains("menu_language");
        if (!isMenuTask) {
            return false;
        }
        return safePrompt.length() >= Math.max(20000, aiMenuAutoContinuePromptThresholdChars);
    }

    private boolean isValidMenuOutputPayload(String rawContent) {
        String text = extractAiResultText(rawContent);
        if (text.isBlank()) {
            return false;
        }
        if (!isLikelyJsonPayload(text)) {
            return false;
        }
        if (!isJsonStructureBalanced(text)) {
            return false;
        }
        String normalized = text.toLowerCase();
        return normalized.contains("\"menu\"")
            || normalized.contains("\"menus\"")
            || normalized.contains("\"menu_node\"");
    }

    private boolean isJsonStructureBalanced(String text) {
        String raw = String.valueOf(text == null ? "" : text).trim();
        if (raw.isBlank()) {
            return false;
        }
        int brace = 0;
        int bracket = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (c == '\\') {
                    escaped = true;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }
            if (c == '"') {
                inString = true;
                continue;
            }
            if (c == '{') {
                brace++;
            } else if (c == '}') {
                brace--;
            } else if (c == '[') {
                bracket++;
            } else if (c == ']') {
                bracket--;
            }
            if (brace < 0 || bracket < 0) {
                return false;
            }
        }
        return !inString && brace == 0 && bracket == 0;
    }

    private String buildMenuAutoContinuePrompt(String originalPrompt, String previousOutput, int attempt, int maxAttempts) {
        StringBuilder sb = new StringBuilder();
        sb.append("MENU TWO-PHASE FINALIZE (attempt ").append(attempt).append("/").append(maxAttempts).append(")\\n");
        sb.append("Kết quả trước chưa hợp lệ hoặc bị cắt. Hãy trả về JSON cuối cùng hoàn chỉnh, không markdown, không code fence.\\n");
        sb.append("BẮT BUỘC:\\n");
        sb.append("1. Trả lại đầy đủ menu tree theo yêu cầu gốc, không rút gọn.\\n");
        sb.append("2. Giữ đầy đủ 3 ngôn ngữ cho menu/table/field (vi,en,zh) theo contract.\\n");
        sb.append("3. JSON phải đóng mở ngoặc đầy đủ và parse được ngay.\\n");
        sb.append("4. Không thêm giải thích ngoài JSON.\\n\\n");
        sb.append("=== ORIGINAL REQUEST CONTEXT ===\\n");
        sb.append(truncateMiddle(String.valueOf(originalPrompt == null ? "" : originalPrompt), Math.max(20000, aiCodeStreamMaxPromptChars))).append("\\n\\n");
        sb.append("=== PREVIOUS INCOMPLETE OUTPUT ===\\n");
        sb.append(truncateMiddle(String.valueOf(previousOutput == null ? "" : previousOutput), Math.max(12000, aiMenuAutoContinueMaxPreviousOutputChars))).append("\\n");
        return sb.toString();
    }

    private Set<String> detectMissingLanguageFields(String jsonStr) {
        Set<String> missing = new HashSet<>();
        String text = extractAiResultText(jsonStr);
        if (text == null || text.isBlank()) {
            return missing;
        }
        
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = objectMapper.readValue(text, Map.class);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> menus = (List<Map<String, Object>>) root.get("menu");
            if (menus == null) {
                return missing;
            }
            
            for (Map<String, Object> menuItem : menus) {
                detectMissingInMenuItem(menuItem, missing);
            }
        } catch (Exception e) {
            // Ignore JSON parsing errors
        }
        return missing;
    }

    @SuppressWarnings("unchecked")
    private void detectMissingInMenuItem(Map<String, Object> item, Set<String> missing) {
        if (item == null) {
            return;
        }
        
        String id = String.valueOf(item.getOrDefault("id", "unknown"));
        String label = String.valueOf(item.getOrDefault("label", ""));
        
        // Check label_en and label_zh
        Object labelEn = item.get("label_en");
        Object labelZh = item.get("label_zh");
        
        if ((labelEn == null || String.valueOf(labelEn).isBlank()) && !label.isBlank()) {
            missing.add(id + "|label_en");
        }
        if ((labelZh == null || String.valueOf(labelZh).isBlank()) && !label.isBlank()) {
            missing.add(id + "|label_zh");
        }
        
        // Check f_header_en and f_header_zh
        Object fHeader = item.get("f_header");
        Object fHeaderEn = item.get("f_header_en");
        Object fHeaderZh = item.get("f_header_zh");
        
        if ((fHeader != null && !String.valueOf(fHeader).isBlank()) || 
            (fHeaderEn != null && !String.valueOf(fHeaderEn).isBlank())) {
            if ((fHeaderEn == null || String.valueOf(fHeaderEn).isBlank()) && 
                (fHeader != null && !String.valueOf(fHeader).isBlank())) {
                missing.add(id + "|f_header_en");
            }
            if ((fHeaderZh == null || String.valueOf(fHeaderZh).isBlank()) && 
                (fHeader != null && !String.valueOf(fHeader).isBlank())) {
                missing.add(id + "|f_header_zh");
            }
        }
        
        // Recursively check children
        List<Map<String, Object>> children = (List<Map<String, Object>>) item.get("children");
        if (children != null) {
            for (Map<String, Object> child : children) {
                detectMissingInMenuItem(child, missing);
            }
        }
    }

    private String buildLanguageFillPrompt(String originalPrompt, String currentOutput, Set<String> missingFields) {
        StringBuilder sb = new StringBuilder();
        sb.append("MENU THREE-PHASE FILL-MISSING-LANGUAGES\\n");
        sb.append("JSON output đã hợp lệ, nhưng thiếu một số bản dịch tiếng Anh hoặc tiếng Trung.\\n");
        sb.append("Hãy trả về JSON đầy đủ với các dịch missing được điền vào.\\n\\n");
        sb.append("BẮT BUỘC:\\n");
        sb.append("1. Dựa vào Vietnamese label/f_header, tạo English dịch chuyên nghiệp.\\n");
        sb.append("2. Từ Vietnamese, tạo Chinese (Simplified) dịch chuyên nghiệp.\\n");
        sb.append("3. Giữ nguyên tất cả fields khác không thay đổi.\\n");
        sb.append("4. Trả về JSON hoàn chỉnh, không markdown, không code fence.\\n");
        sb.append("5. JSON phải parse được ngay.\\n\\n");
        sb.append("=== MISSING FIELDS ("); sb.append(missingFields.size()).append(") ===\\n");
        missingFields.stream().limit(20).forEach(field -> sb.append("• ").append(field).append("\\n"));
        if (missingFields.size() > 20) {
            sb.append("... and ").append(missingFields.size() - 20).append(" more\\n");
        }
        sb.append("\\n=== CURRENT VALID OUTPUT ===\\n");
        sb.append(truncateMiddle(String.valueOf(currentOutput == null ? "" : currentOutput), Math.max(15000, aiMenuAutoContinueMaxPreviousOutputChars))).append("\\n");
        return sb.toString();
    }

    private boolean shouldFallbackToGemini(String rawContent) {
        if (rawContent == null || rawContent.trim().isEmpty()) {
            return false;
        }

        if (isRateOrQuotaFailureFromRawText(rawContent)) {
            return true;
        }

        if (isAuthFailureFromRawText(rawContent)) {
            return true;
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(rawContent, Map.class);

            if (Boolean.FALSE.equals(parsed.get("success"))) {
                String errorCode = String.valueOf(parsed.getOrDefault("errorCode", ""));
                String message = String.valueOf(parsed.getOrDefault("message", ""));
                if (isInvalidFinalOutputFailure(errorCode, message)) {
                    return true;
                }
                return isRateOrQuotaFailure(errorCode, message) || isAuthFailure(errorCode, message);
            }

            if (Boolean.TRUE.equals(parsed.get("error"))) {
                String errorCode = String.valueOf(parsed.getOrDefault("errorCode", ""));
                String message = String.valueOf(parsed.getOrDefault("message", ""));
                if (isInvalidFinalOutputFailure(errorCode, message)) {
                    return true;
                }
                return isRateOrQuotaFailure(errorCode, message) || isAuthFailure(errorCode, message);
            }

            // Some AiAssistantGatewayService paths may return success wrapper while inner `result`
            // carries an error JSON/string. Detect and fallback in that case too.
            Object result = parsed.get("result");
            if (result != null) {
                String resultText = String.valueOf(result);
                if (isRateOrQuotaFailureFromRawText(resultText)) {
                    return true;
                }
                if (isAuthFailureFromRawText(resultText)) {
                    return true;
                }
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> nested = objectMapper.readValue(resultText, Map.class);
                    if (Boolean.FALSE.equals(nested.get("success")) || Boolean.TRUE.equals(nested.get("error"))) {
                        String nestedErrorCode = String.valueOf(nested.getOrDefault("errorCode", ""));
                        String nestedMessage = String.valueOf(nested.getOrDefault("message", ""));
                        if (isRateOrQuotaFailure(nestedErrorCode, nestedMessage)
                                || isAuthFailure(nestedErrorCode, nestedMessage)) {
                            return true;
                        }
                    }
                } catch (Exception ignored) {
                    // Ignore nested parse failures; raw text detection above already checked.
                }
            }

            Object content = parsed.get("content");
            if (content != null && isRateOrQuotaFailureFromRawText(String.valueOf(content))) {
                return true;
            }
            if (content != null && isAuthFailureFromRawText(String.valueOf(content))) {
                return true;
            }
        } catch (Exception ignored) {
            return isRateOrQuotaFailureFromRawText(rawContent) || isAuthFailureFromRawText(rawContent);
        }
        return false;
    }

    private boolean isAuthFailureFromRawText(String raw) {
        String text = String.valueOf(raw == null ? "" : raw).toLowerCase();
        if (text.isBlank()) {
            return false;
        }
        return text.contains("401")
                || text.contains("unauthorized")
                || text.contains("authentication failed")
                || text.contains("invalid token")
                || text.contains("bad credentials")
                || text.contains("github_token_missing")
                || text.contains("github_copilot_token_invalid");
    }

    private boolean isInvalidFinalOutputFailure(String errorCode, String message) {
        String code = String.valueOf(errorCode == null ? "" : errorCode).toLowerCase();
        String msg = String.valueOf(message == null ? "" : message).toLowerCase();
        return code.contains("github_final_output_invalid")
                || code.contains("github_merge_parse_empty")
                || code.contains("models_exhausted")
                || msg.contains("ket qua cuoi khong hop le")
                || msg.contains("khong phai json menu")
                || msg.contains("models exhausted");
    }

    private boolean shouldDirectProviderRouteForLargeMenu(
            String contextType,
            String taskType,
            List<Map<String, Object>> attachments,
            String message,
            String currentCode,
            int estimatedChars) {
        if (!aiAssistantMenuDirectProviderFallbackEnabled) {
            return false;
        }
        if (!isMenuAiAssistantFlow(contextType, taskType)) {
            return false;
        }
        return estimatedChars >= Math.max(50000, aiAssistantMenuDirectProviderThresholdChars);
    }

    private String buildMenuGlobalContext(
            String appId,
            String continuityScopeKey,
            String contextType,
            String taskType,
            String message,
            String currentCode,
            List<Map<String, Object>> attachments) {
        if (!aiAssistantMemoryManagerEnabled) {
            return "";
        }
        if (!isMenuAiAssistantFlow(contextType, taskType)) {
            return "";
        }
        try {
            String globalContext = aiAssistantMemoryManagerService.buildAndPersistMenuGlobalContext(
                appId,
                continuityScopeKey,
                message,
                currentCode,
                attachments);
            return String.valueOf(globalContext == null ? "" : globalContext).trim();
        } catch (Exception ex) {
            logger.warn("AI Assistant memory manager failed, continue without global context: {}", ex.getMessage());
            return "";
        }
    }

    private String loadAiAssistantCustomInstructions() {
        if (cachedAiAssistantCustomInstructions != null) return cachedAiAssistantCustomInstructions;
        synchronized (this) {
            if (cachedAiAssistantCustomInstructions != null) return cachedAiAssistantCustomInstructions;
            try {
                String path = String.valueOf(aiAssistantCustomInstructionsPath == null ? "" : aiAssistantCustomInstructionsPath).trim();
                if (path.isEmpty()) { cachedAiAssistantCustomInstructions = ""; return ""; }
                java.io.File f = new java.io.File(path);
                if (f.exists() && f.isFile()) {
                    cachedAiAssistantCustomInstructions = java.nio.file.Files.readString(f.toPath(), java.nio.charset.StandardCharsets.UTF_8).trim();
                } else {
                    // Try classpath
                    var resource = new org.springframework.core.io.ClassPathResource(path);
                    if (resource.exists()) {
                        try (var in = resource.getInputStream()) {
                            cachedAiAssistantCustomInstructions = org.springframework.util.StreamUtils.copyToString(in, java.nio.charset.StandardCharsets.UTF_8).trim();
                        }
                    } else {
                        cachedAiAssistantCustomInstructions = "";
                    }
                }
            } catch (Exception ex) {
                logger.warn("Cannot load AI Assistant custom instructions from {}: {}", aiAssistantCustomInstructionsPath, ex.getMessage());
                cachedAiAssistantCustomInstructions = "";
            }
        }
        return cachedAiAssistantCustomInstructions;
    }

    /**
     * CHAINING Step 1: For very large menu payloads, call AI Assistant API with a lightweight
     * "extract schema" prompt to produce a compact summary of all large JSON config attachments.
     * The summary is then injected into the final menu design prompt (Step 2 = main call).
     * This avoids sending 2.5M+ chars raw JSON in a single call.
     */
    private String runMenuChainingStep1(List<Map<String, Object>> attachments, String appId) {
        if (attachments == null || attachments.isEmpty()) return "";
        int distillThreshold = Math.max(20000, aiAssistantMenuDistillThresholdChars);

        StringBuilder step1Prompt = new StringBuilder();
        step1Prompt.append("You are an AI assistant helping to summarize CSM (Content Management System) configuration files.\n");
        step1Prompt.append("Below are distilled schemas extracted from large JSON config files.\n");
        step1Prompt.append("Your task: For each config file, produce a compact structured summary that includes:\n");
        step1Prompt.append("- All table names\n- Key column names per table\n- Important relationships or mappings\n");
        step1Prompt.append("- For triggers: group by loaitrigger type with affected tables\n");
        step1Prompt.append("Output as a structured text schema summary, max 8000 chars total.\n");
        step1Prompt.append("Do NOT write menu JSON — only extract and summarize the schema.\n\n");

        boolean hasAnyLargeAttachment = false;
        for (Map<String, Object> attachment : attachments) {
            String kind = String.valueOf(attachment.getOrDefault("kind", "")).trim().toLowerCase();
            if (!"text".equals(kind) && !"json".equals(kind)) continue;
            String text = String.valueOf(attachment.getOrDefault("textContent", "")).trim();
            if (text.length() <= distillThreshold) continue;
            String name = String.valueOf(attachment.getOrDefault("name", "attachment")).trim();
            // Use Java-side distillation to compress before sending even the step1 prompt
            String distilled;
            try {
                distilled = aiAssistantMemoryManagerService.distillJsonForMenu(name, text);
            } catch (Exception ex) {
                distilled = text.substring(0, Math.min(text.length(), 15000));
            }
            if (distilled.isBlank()) continue;
            step1Prompt.append("### File: ").append(name).append(" (original: ").append(text.length()).append(" chars)\n");
            int maxPerFile = 15000;
            if (distilled.length() > maxPerFile) {
                step1Prompt.append(distilled, 0, maxPerFile).append("\n...[truncated]\n");
            } else {
                step1Prompt.append(distilled).append("\n");
            }
            step1Prompt.append("\n");
            hasAnyLargeAttachment = true;
        }
        if (!hasAnyLargeAttachment) return "";

        int maxStep1Chars = 60000;
        String promptText = step1Prompt.length() > maxStep1Chars
            ? step1Prompt.substring(0, maxStep1Chars)
            : step1Prompt.toString();

        try {
            String rawResult = aiAssistantGatewayService.generateContent(promptText);
            String extracted = extractAiResultText(rawResult);
            return extracted.isBlank() ? "" : "# Chaining Step 1 Schema Summary\n" + extracted.trim();
        } catch (Exception ex) {
            logger.warn("AI Assistant chaining step1 call failed for appId={}: {}", appId, ex.getMessage());
            return "";
        }
    }

    private CodeChainingResult runCodeChainingStep1(
            String currentCode,
            String message,
            String language,
            String appId,
            String pName) {
        long startedAt = System.currentTimeMillis();
        String code = String.valueOf(currentCode == null ? "" : currentCode);
        if (code.isBlank()) {
            return new CodeChainingResult("", false, 0L, 0, 0, "");
        }

        String fingerprint = Integer.toHexString(code.hashCode());
        String cacheKey = buildCodeChainingCacheKey(appId, pName, language, fingerprint);
        if (aiAssistantCodeChainingCacheEnabled) {
            CodeChainingCacheEntry cached = getCodeChainingCache(cacheKey);
            if (cached != null) {
                long elapsed = Math.max(0L, System.currentTimeMillis() - startedAt);
                logger.info("AI Assistant code chaining cache HIT: appId={} fileKey={} fingerprint={} summaryChars={} elapsedMs={}",
                    appId,
                    String.valueOf(pName == null ? "" : pName).trim(),
                    fingerprint,
                    cached.summary.length(),
                    elapsed);
                return new CodeChainingResult(cached.summary, true, elapsed, 0, cached.summary.length(), fingerprint);
            }
        }

        String globalMap = buildAiAssistantGlobalCodeMap(code, language);
        List<String> focusExcerpts = buildAiAssistantFocusExcerpts(code, message, 18000);
        List<String> distributed = buildCodeDistributedCoverageExcerpts(code, 6, 1800);

        StringBuilder step1Prompt = new StringBuilder();
        step1Prompt.append("You are an expert code summarizer for a large active editor buffer.\n");
        step1Prompt.append("Goal: summarize the provided code for downstream editing while staying faithful to current implementation.\n");
        step1Prompt.append("Output format:\n");
        step1Prompt.append("1) FILE_IDENTITY\n2) KEY_SYMBOLS\n3) CRITICAL_EXECUTION_FLOW\n4) EDIT_RISK_AREAS\n5) SAFE_EDIT_GUIDELINES\n");
        step1Prompt.append("Keep output under 7000 chars. Do not invent APIs not present in context.\n\n");

        step1Prompt.append("file_key=").append(String.valueOf(pName == null ? "" : pName).trim()).append("\n");
        step1Prompt.append("language=").append(String.valueOf(language == null ? "" : language).trim()).append("\n");
        step1Prompt.append("chars=").append(code.length()).append(", lines=").append(countLines(code)).append("\n\n");

        if (!globalMap.isBlank()) {
            step1Prompt.append("## GLOBAL_MAP\n").append(globalMap).append("\n\n");
        }
        if (!focusExcerpts.isEmpty()) {
            step1Prompt.append("## REQUEST_FOCUS_EXCERPTS\n");
            int idx = 1;
            for (String ex : focusExcerpts) {
                if (ex == null || ex.isBlank()) continue;
                step1Prompt.append("### focus_").append(idx++).append("\n").append(ex).append("\n\n");
            }
        }
        if (!distributed.isEmpty()) {
            step1Prompt.append("## DISTRIBUTED_FILE_COVERAGE\n");
            int idx = 1;
            for (String ex : distributed) {
                if (ex == null || ex.isBlank()) continue;
                step1Prompt.append("### slice_").append(idx++).append("\n").append(ex).append("\n\n");
            }
        }

        String stepPrompt = step1Prompt.toString();
        if (stepPrompt.length() > 65000) {
            stepPrompt = stepPrompt.substring(0, 65000);
        }

        try {
            String raw = aiAssistantGatewayService.generateContent(stepPrompt);
            String extracted = extractAiResultText(raw);
            if (extracted.isBlank()) {
                long elapsed = Math.max(0L, System.currentTimeMillis() - startedAt);
                logger.info("AI Assistant code chaining step1 empty result: appId={} fileKey={} fingerprint={} promptChars={} elapsedMs={}",
                    appId,
                    String.valueOf(pName == null ? "" : pName).trim(),
                    fingerprint,
                    stepPrompt.length(),
                    elapsed);
                return new CodeChainingResult("", false, elapsed, stepPrompt.length(), 0, fingerprint);
            }
            String summary = "# Code Chaining Step 1 Summary\n" + extracted.trim();
            if (aiAssistantCodeChainingCacheEnabled) {
                putCodeChainingCache(cacheKey, summary);
            }
            long elapsed = Math.max(0L, System.currentTimeMillis() - startedAt);
            logger.info("AI Assistant code chaining step1 done: appId={} fileKey={} fingerprint={} inputChars={} promptChars={} outputChars={} elapsedMs={}",
                appId,
                String.valueOf(pName == null ? "" : pName).trim(),
                fingerprint,
                code.length(),
                stepPrompt.length(),
                summary.length(),
                elapsed);
            return new CodeChainingResult(summary, false, elapsed, stepPrompt.length(), summary.length(), fingerprint);
        } catch (Exception ex) {
            logger.warn("AI Assistant code chaining step1 call failed for appId={}: {}", appId, ex.getMessage());
            long elapsed = Math.max(0L, System.currentTimeMillis() - startedAt);
            return new CodeChainingResult("", false, elapsed, stepPrompt.length(), 0, fingerprint);
        }
    }

    private String buildCodeChainingCacheKey(String appId, String pName, String language, String fingerprint) {
        return String.valueOf(appId == null ? "" : appId).trim()
            + "|"
            + String.valueOf(pName == null ? "" : pName).trim()
            + "|"
            + String.valueOf(language == null ? "" : language).trim().toLowerCase(java.util.Locale.ROOT)
            + "|"
            + String.valueOf(fingerprint == null ? "" : fingerprint).trim();
    }

    private CodeChainingCacheEntry getCodeChainingCache(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        CodeChainingCacheEntry entry = codeChainingStep1Cache.get(key);
        if (entry == null) {
            return null;
        }
        long ttl = Math.max(60_000L, aiAssistantCodeChainingCacheTtlMs);
        if ((System.currentTimeMillis() - entry.createdAtMs) > ttl) {
            codeChainingStep1Cache.remove(key);
            return null;
        }
        return entry;
    }

    private void putCodeChainingCache(String key, String summary) {
        if (key == null || key.isBlank()) {
            return;
        }
        String value = String.valueOf(summary == null ? "" : summary).trim();
        if (value.isEmpty()) {
            return;
        }
        codeChainingStep1Cache.put(key, new CodeChainingCacheEntry(value, System.currentTimeMillis()));
        pruneCodeChainingCacheIfNeeded();
    }

    private void pruneCodeChainingCacheIfNeeded() {
        int maxEntries = Math.max(32, aiAssistantCodeChainingCacheMaxEntries);
        if (codeChainingStep1Cache.size() <= maxEntries) {
            return;
        }

        String oldestKey = null;
        long oldestTs = Long.MAX_VALUE;
        for (Map.Entry<String, CodeChainingCacheEntry> entry : codeChainingStep1Cache.entrySet()) {
            long ts = entry.getValue() == null ? Long.MAX_VALUE : entry.getValue().createdAtMs;
            if (ts < oldestTs) {
                oldestTs = ts;
                oldestKey = entry.getKey();
            }
        }
        if (oldestKey != null) {
            codeChainingStep1Cache.remove(oldestKey);
        }
    }

    private static class CodeChainingCacheEntry {
        final String summary;
        final long createdAtMs;

        CodeChainingCacheEntry(String summary, long createdAtMs) {
            this.summary = String.valueOf(summary == null ? "" : summary);
            this.createdAtMs = createdAtMs;
        }
    }

    private static class CodeChainingResult {
        final String summary;
        final boolean cacheHit;
        final long elapsedMs;
        final int promptChars;
        final int responseChars;
        final String fingerprint;

        CodeChainingResult(String summary, boolean cacheHit, long elapsedMs, int promptChars, int responseChars, String fingerprint) {
            this.summary = String.valueOf(summary == null ? "" : summary);
            this.cacheHit = cacheHit;
            this.elapsedMs = elapsedMs;
            this.promptChars = Math.max(0, promptChars);
            this.responseChars = Math.max(0, responseChars);
            this.fingerprint = String.valueOf(fingerprint == null ? "" : fingerprint);
        }
    }

    private boolean shouldQuickPrimaryProbeForMediumMenu(
            String contextType,
            String taskType,
            int estimatedChars) {
        if (!aiAssistantMenuPrimaryProbeEnabled) {
            return false;
        }
        if (!isMenuAiAssistantFlow(contextType, taskType)) {
            return false;
        }
        int lowerBound = Math.max(50000, aiAssistantMenuPrimaryProbeThresholdChars);
        int upperBound = aiAssistantMenuDirectProviderFallbackEnabled
                ? Math.max(lowerBound + 1000, Math.max(50000, aiAssistantMenuDirectProviderThresholdChars))
                : Integer.MAX_VALUE;
        return estimatedChars >= lowerBound && estimatedChars < upperBound;
    }

    private boolean shouldSkipPrimaryProbeForHugeMenuPayload(int estimatedChars) {
        int directThreshold = Math.max(50000, aiAssistantMenuDirectProviderThresholdChars);
        double ratio = aiAssistantMenuPrimaryProbeSkipWhenOverRatio <= 1.0d ? 1.4d : aiAssistantMenuPrimaryProbeSkipWhenOverRatio;
        long skipThreshold = Math.round(directThreshold * ratio);
        return estimatedChars >= Math.max(directThreshold + 10000, (int) Math.min(Integer.MAX_VALUE, skipThreshold));
    }

    private int estimateTotalAiAssistantPayloadChars(
            List<Map<String, Object>> attachments,
            String message,
            String currentCode,
            String continuityMemory,
            String aggregatedReusableMemory,
            String globalContext) {
        return Math.max(0, String.valueOf(message == null ? "" : message).length())
                + Math.max(0, String.valueOf(currentCode == null ? "" : currentCode).length())
                + Math.max(0, String.valueOf(continuityMemory == null ? "" : continuityMemory).length())
                + Math.max(0, String.valueOf(aggregatedReusableMemory == null ? "" : aggregatedReusableMemory).length())
                + Math.max(0, String.valueOf(globalContext == null ? "" : globalContext).length())
                + estimateAttachmentTextChars(attachments);
    }

    private int estimateAttachmentTextChars(List<Map<String, Object>> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return 0;
        }
        int total = 0;
        for (Map<String, Object> attachment : attachments) {
            if (attachment == null) {
                continue;
            }
            String text = String.valueOf(attachment.getOrDefault("textContent", ""));
            total += Math.max(0, text.length());
            if (total >= 3_000_000) {
                return total;
            }
        }
        return total;
    }

    private boolean isLikelyJsonPayload(String text) {
        String raw = String.valueOf(text == null ? "" : text).trim();
        if (raw.isEmpty()) {
            return false;
        }
        String normalized = raw;
        if (normalized.startsWith("```") && normalized.endsWith("```")) {
            int firstNl = normalized.indexOf('\n');
            if (firstNl > 0) {
                normalized = normalized.substring(firstNl + 1);
            }
            normalized = normalized.substring(0, Math.max(0, normalized.length() - 3)).trim();
        }
        if (!(normalized.startsWith("{") || normalized.startsWith("["))) {
            return false;
        }
        try {
            com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(normalized);
            return node.isObject() || node.isArray();
        } catch (Exception ignored) {
            return false;
        }
    }

    private String runPrimaryProbeWithTimeout(
            String probePrompt,
            AiAssistantGatewayService.ProgressListener streamListener,
            String appId,
            String stage) {
        long timeoutMs = Math.max(3000L, aiAssistantMenuPrimaryProbeTimeoutMs);
        Future<String> future = aiAsyncExecutor.submit(() -> aiAssistantGatewayService.generateContent(probePrompt, streamListener));
        try {
            return future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException ex) {
            future.cancel(true);
            logger.warn("AI Assistant stream: {} timed out after {}ms, forcing fallback", stage, timeoutMs);
            emitAiAssistantChatChunk(appId, Map.of(
                "stage", stage + "_timeout",
                "message", "Quick probe timeout, chuyen fallback ngay",
                "status", "running"
            ));
            return "";
        } catch (Exception ex) {
            logger.warn("AI Assistant stream: {} failed: {}", stage, ex.getMessage());
            return "";
        }
    }

    private boolean shouldDisableGeminiFallbackForMenu(String contextType, String taskType) {
        return aiAssistantMenuDisableGeminiFallback && isMenuAiAssistantFlow(contextType, taskType);
    }

    private boolean shouldForceGeminiFallbackForMenuFailure(
            String contextType,
            String taskType,
            String raw,
            boolean upstreamFallbackSignal) {
        if (!isMenuAiAssistantFlow(contextType, taskType)) {
            return false;
        }
        if (!upstreamFallbackSignal) {
            return false;
        }
        String text = String.valueOf(raw == null ? "" : raw);
        return isTransientUpstreamFailureFromRawText(text)
            || isRateOrQuotaFailureFromRawText(text)
            || isAuthFailureFromRawText(text)
            || containsInvalidFinalMenuSignals(text);
    }

    private boolean containsInvalidFinalMenuSignals(String raw) {
        String text = String.valueOf(raw == null ? "" : raw).toLowerCase();
        return text.contains("github_final_output_invalid")
            || text.contains("github_merge_parse_empty")
            || text.contains("khong phai json menu")
            || text.contains("không phải json menu")
            || text.contains("models exhausted");
    }

    private boolean isTransientUpstreamFailureFromRawText(String raw) {
        String text = String.valueOf(raw == null ? "" : raw).toLowerCase();
        if (text.isBlank()) {
            return false;
        }
        return text.contains("operation timed out")
            || text.contains("timed out")
            || text.contains("webclientrequestexception")
            || text.contains("connectexception")
            || text.contains("ioexception")
            || text.contains("connection observed an error")
            || text.contains("connection reset")
            || text.contains("broken pipe")
            || text.contains("gateway timeout")
            || text.contains("502 bad gateway")
            || text.contains("503 service unavailable")
            || text.contains("504 gateway timeout");
    }

    private boolean isRateOrQuotaFailureFromRawText(String raw) {
        String text = String.valueOf(raw == null ? "" : raw).toLowerCase();
        if (text.isBlank()) {
            return false;
        }
        return text.contains("daily quota")
                || text.contains("quota")
                || text.contains("rate limit")
                || text.contains("too many requests")
                || text.contains("userbymodelbyday")
                || text.contains("per 86400s")
                || text.contains("429")
                || text.contains("413")
                || text.contains("payload too large")
                || text.contains("tokens_limit_reached")
                || text.contains("request body too large")
                || text.contains("max size: 8000 tokens")
                || text.contains("tat ca aiAssistant models deu that bai")
                || text.contains("tất cả aiAssistant models đều thất bại");
    }

    private boolean isRateOrQuotaFailure(String errorCode, String message) {
        String code = errorCode == null ? "" : errorCode.toLowerCase();
        String msg = message == null ? "" : message.toLowerCase();

        return code.contains("quota")
                || code.contains("rate")
                || code.contains("429")
                || msg.contains("quota")
                || msg.contains("rate limit")
                || msg.contains("too many requests")
                || msg.contains("per 86400s")
                || msg.contains("userbymodelbyday")
                || msg.contains("rate limit exceeded");
    }

    private boolean isAuthFailure(String errorCode, String message) {
        String code = errorCode == null ? "" : errorCode.toLowerCase();
        String msg = message == null ? "" : message.toLowerCase();

        return code.contains("401")
                || code.contains("unauthorized")
                || code.contains("auth")
                || msg.contains("401")
                || msg.contains("unauthorized")
                || msg.contains("authentication failed")
                || msg.contains("invalid token")
            || msg.contains("bad credentials");
    }

    private boolean isHardQuotaFailure(String rawContent) {
        if (rawContent == null || rawContent.trim().isEmpty()) {
            return false;
        }

        String normalizedRaw = rawContent.toLowerCase();
        if (normalizedRaw.contains("daily quota")
                || normalizedRaw.contains("userbymodelbyday")
                || normalizedRaw.contains("per 86400s")) {
            return true;
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(rawContent, Map.class);
            String errorCode = String.valueOf(parsed.getOrDefault("errorCode", "")).toLowerCase();
            String message = String.valueOf(parsed.getOrDefault("message", "")).toLowerCase();
            if (errorCode.contains("daily") || errorCode.contains("userbymodelbyday") || errorCode.contains("per_86400")) {
                return true;
            }
            return message.contains("daily quota")
                    || message.contains("userbymodelbyday")
                    || message.contains("per 86400s");
        } catch (Exception ignored) {
            return false;
        }
    }

    private String extractAiResultText(String rawContent) {
        if (rawContent == null || rawContent.trim().isEmpty()) {
            return "";
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(rawContent, Map.class);

            Object topLevelSuccess = parsed.get("success");
            if (topLevelSuccess instanceof Boolean && !((Boolean) topLevelSuccess)) {
                return "";
            }
            Object topLevelError = parsed.get("error");
            if (topLevelError instanceof Boolean && ((Boolean) topLevelError)) {
                return "";
            }

            Object result = parsed.get("result");
            if (result instanceof String) {
                return String.valueOf(result).trim();
            }
            if (result != null) {
                try {
                    return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(result).trim();
                } catch (Exception ignored) {
                    return String.valueOf(result).trim();
                }
            }

            Object content = parsed.get("content");
            if (content instanceof String) {
                return String.valueOf(content).trim();
            }
            if (content != null) {
                try {
                    return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(content).trim();
                } catch (Exception ignored) {
                    return String.valueOf(content).trim();
                }
            }
        } catch (Exception ignored) {
            return rawContent.trim();
        }

        return "";
    }

    private String extractAiErrorMessage(String rawContent) {
        if (rawContent == null || rawContent.trim().isEmpty()) {
            return "";
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(rawContent, Map.class);

            Object topLevelSuccess = parsed.get("success");
            Object topLevelError = parsed.get("error");
            boolean isError = (topLevelSuccess instanceof Boolean && !((Boolean) topLevelSuccess))
                || (topLevelError instanceof Boolean && ((Boolean) topLevelError));

            String message = String.valueOf(parsed.getOrDefault("message", "")).trim();
            String errorCode = String.valueOf(parsed.getOrDefault("errorCode", "")).trim();

            if (isError) {
                if (!message.isBlank()) {
                    return message;
                }
                if (!errorCode.isBlank()) {
                    return errorCode;
                }
            }

            Object result = parsed.get("result");
            if (result instanceof Map<?, ?> nested) {
                Object nestedSuccess = nested.get("success");
                Object nestedError = nested.get("error");
                boolean nestedIsError = (nestedSuccess instanceof Boolean && !((Boolean) nestedSuccess))
                    || (nestedError instanceof Boolean && ((Boolean) nestedError));
                if (nestedIsError) {
                    String nestedMessage = String.valueOf(nested.get("message") == null ? "" : nested.get("message")).trim();
                    String nestedCode = String.valueOf(nested.get("errorCode") == null ? "" : nested.get("errorCode")).trim();
                    if (!nestedMessage.isBlank()) {
                        return nestedMessage;
                    }
                    if (!nestedCode.isBlank()) {
                        return nestedCode;
                    }
                }
            }
        } catch (Exception ignored) {
            // ignore parse errors
        }

        return "";
    }

    private String extractMenuDraftForCompletion(String rawResponse, String contextType) {
        if (!isMenuJsonContext(contextType)) {
            return "";
        }

        String raw = String.valueOf(rawResponse == null ? "" : rawResponse).trim();
        if (raw.isBlank()) {
            return "";
        }

        List<String> candidates = new ArrayList<>();
        candidates.add(raw);
        String cleaned = cleanMarkdownFromJson(raw);
        if (cleaned != null && !cleaned.isBlank() && !cleaned.equals(raw)) {
            candidates.add(cleaned.trim());
        }

        for (String candidate : candidates) {
            String normalized = normalizeMenuDraftJson(candidate);
            if (!normalized.isBlank()) {
                return normalized;
            }
        }

        return "";
    }

    private String mergeMenuCompletionWithBase(String baseDraftRaw, String aiDraftRaw, String contextType) {
        String normalizedAiDraft = extractMenuDraftForCompletion(aiDraftRaw, contextType);
        if (normalizedAiDraft.isBlank()) {
            return aiDraftRaw == null ? "" : aiDraftRaw;
        }

        String normalizedBaseDraft = extractMenuDraftForCompletion(baseDraftRaw, contextType);
        if (normalizedBaseDraft.isBlank()) {
            return normalizedAiDraft;
        }

        try {
            AiMenuMergeService.MergeOutput mergeOut = aiMenuMergeService.diffMergeTrees(normalizedBaseDraft, normalizedAiDraft);
            if (mergeOut != null && mergeOut.mergedMenu != null) {
                Map<String, Object> wrapped = new LinkedHashMap<>();
                wrapped.put("menu", mergeOut.mergedMenu);
                String merged = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(wrapped);
                logger.info("ai-code-stream menu completion merged with base: added={} edited={} deleted={} patchOps={}",
                    mergeOut.added,
                    mergeOut.edited,
                    mergeOut.deleted,
                    mergeOut.patchOps == null ? 0 : mergeOut.patchOps.size());
                return merged;
            }
        } catch (Exception ex) {
            logger.warn("ai-code-stream menu completion merge failed, fallback to normalized AI draft: {}", ex.getMessage());
        }

        return normalizedAiDraft;
    }

    private String normalizeMenuDraftJson(String text) {
        String raw = String.valueOf(text == null ? "" : text).trim();
        if (raw.isBlank()) {
            return "";
        }

        Object parsed;
        try {
            parsed = objectMapper.readValue(raw, Object.class);
        } catch (Exception ignored) {
            return "";
        }

        if (parsed instanceof List<?> list) {
            Map<String, Object> wrapped = new HashMap<>();
            wrapped.put("menu", list);
            try {
                return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(wrapped);
            } catch (Exception ignored) {
                return "";
            }
        }

        if (!(parsed instanceof Map<?, ?> map)) {
            return "";
        }

        Object code = map.get("code");
        if (code instanceof String codeText) {
            String candidate = codeText.trim();
            if (!candidate.isBlank() && !candidate.equals(raw)) {
                String fromCode = normalizeMenuDraftJson(candidate);
                if (!fromCode.isBlank()) {
                    return fromCode;
                }
            }
        }

        Object menu = map.get("menu");
        if (menu instanceof List<?>) {
            Map<String, Object> wrapped = new HashMap<>();
            wrapped.put("menu", menu);
            try {
                return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(wrapped);
            } catch (Exception ignored) {
                return "";
            }
        }

        Object menus = map.get("menus");
        if (menus instanceof List<?> menuList) {
            Map<String, Object> wrapped = new HashMap<>();
            wrapped.put("menu", menuList);
            try {
                return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(wrapped);
            } catch (Exception ignored) {
                return "";
            }
        }

        Object nestedData = map.get("data");
        if (nestedData instanceof Map<?, ?> nestedMap) {
            Object nestedMenu = nestedMap.get("menu");
            if (nestedMenu instanceof List<?> menuList) {
                Map<String, Object> wrapped = new HashMap<>();
                wrapped.put("menu", menuList);
                try {
                    return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(wrapped);
                } catch (Exception ignored) {
                    return "";
                }
            }
        }

        if (isLikelyMenuNodeMap(map)) {
            Map<String, Object> wrapped = new HashMap<>();
            wrapped.put("menu", List.of(map));
            try {
                return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(wrapped);
            } catch (Exception ignored) {
                return "";
            }
        }

        return "";
    }

    private boolean isLikelyMenuNodeMap(Map<?, ?> map) {
        if (map == null || map.isEmpty()) {
            return false;
        }
        Object id = map.get("id");
        if (!(id instanceof String) || String.valueOf(id).isBlank()) {
            return false;
        }
        return map.containsKey("type_form")
            || map.containsKey("table_name")
            || map.containsKey("table")
            || map.containsKey("children");
    }

    private boolean isMenuJsonContext(String contextType) {
        return "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType).trim());
    }

    private void emitTextAsAiAssistantChunks(String appId, String text, String responseMode, String uiLang) {
        String source = text == null ? "" : text;
        if (source.isBlank()) {
            return;
        }

        int safeChunk = 2400;
        int total = source.length();
        int sent = 0;
        while (sent < total) {
            int end = Math.min(total, sent + safeChunk);
            String chunk = source.substring(sent, end);
            Map<String, Object> payload = new HashMap<>();
            payload.put("stage", "streaming");
            payload.put("message", uiTextByLang(
                uiLang,
                "Nhận dữ liệu",
                "Receiving data",
                "正在接收数据"));
            payload.put("chunk", chunk);
            payload.put("responseMode", responseMode);
            payload.put("current", end);
            payload.put("total", total);
            payload.put("percent", Math.max(0, Math.min(100, (int) Math.round((end * 100.0) / Math.max(1, total)))));
            emitAiAssistantChatChunk(appId, payload);
            sent = end;
        }
    }

    private void populateAiResponseFromRawContent(StandardResponse response, String rawContent, String uiLang) {

        // Try to parse as JSON first (GeminiService now returns JSON for both success and error)
        ObjectMapper objectMapper = new ObjectMapper();
        int contentLength = rawContent.length();
        logger.info("📥 Raw content from AI service - Length: {} chars", contentLength);
        logger.debug("First 300 chars: {}", rawContent.substring(0, Math.min(300, contentLength)));
        logger.debug("Last 300 chars: {}", rawContent.substring(Math.max(0, contentLength - 300)));
        
        try {
            // Parse JSON directly from rawContent
            @SuppressWarnings("unchecked")
            Map<String, Object> parsedResult = objectMapper.readValue(rawContent, Map.class);

            Object topLevelSuccess = parsedResult.get("success");
            if (topLevelSuccess instanceof Boolean && !((Boolean) topLevelSuccess)) {
                response.set("code", 200);
                response.set("success", false);
                response.set("data", parsedResult);
                response.set("message", String.valueOf(parsedResult.getOrDefault("message", uiTextByLang(
                    uiLang,
                    "Lỗi từ dịch vụ AI",
                    "Error from AI service",
                    "来自 AI 服务的错误"))));
                Object topLevelErrorCode = parsedResult.get("errorCode");
                if (topLevelErrorCode != null) {
                    response.set("errorCode", topLevelErrorCode);
                }
                Object topLevelProvider = parsedResult.get("provider");
                if (topLevelProvider != null) {
                    response.set("provider", topLevelProvider);
                }
                logger.warn("AI provider returned top-level failure: {}", parsedResult);
                return;
            }
            
            // Check if this is an error response from AI service
            if (parsedResult.containsKey("error") && (Boolean) parsedResult.get("error")) {
                response.set("code", 200);
                response.set("success", false);
                response.set("message", (String) parsedResult.getOrDefault("message", uiTextByLang(
                    uiLang,
                    "Lỗi từ dịch vụ AI",
                    "Error from AI service",
                    "来自 AI 服务的错误")));
                response.set("errorCode", parsedResult.getOrDefault("errorCode", "UNKNOWN"));
                logger.warn("AI service returned error: {} - {}", 
                    parsedResult.get("errorCode"), parsedResult.get("message"));
                return;
            }
            
            // Extract provider info from wrapped response
            String provider = (String) parsedResult.get("provider");
            Object contentObj = parsedResult.get("content");
            if (contentObj == null && parsedResult.containsKey("result")) {
                contentObj = parsedResult.get("result");
            }

            if (contentObj != null) {
                if (provider == null) {
                    provider = "unknown";
                }

                logger.info("🔍 Processing content from provider: {}", provider);
                
                // Check if content is already parsed as object (JSONObject/Map)
                if (contentObj instanceof Map) {
                    // Content is already parsed JSON object - return as data
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsedData = (Map<String, Object>) contentObj;

                    Object nestedSuccess = parsedData.get("success");
                    if (nestedSuccess instanceof Boolean && !((Boolean) nestedSuccess)) {
                        response.set("code", 200);
                        response.set("success", false);
                        response.set("data", parsedData);
                        response.set("provider", provider);
                        response.set("message", String.valueOf(parsedData.getOrDefault("message", uiTextByLang(
                            uiLang,
                            "Lỗi từ nhà cung cấp AI",
                            "Error from AI provider",
                            "来自 AI 提供方的错误"))));
                        Object nestedErrorCode = parsedData.get("errorCode");
                        if (nestedErrorCode != null) {
                            response.set("errorCode", nestedErrorCode);
                        }
                        logger.warn("❌ Provider {} returned nested error object: {}", provider, parsedData);
                        return;
                    }

                    response.set("code", 200);
                    response.set("success", true);
                    response.set("data", parsedData);
                    response.set("provider", provider);
                    response.set("message", uiTextByLang(
                        uiLang,
                        "Thành công",
                        "Success",
                        "成功"));
                    logger.info("✅ Successfully processed JSON object content from provider: {} - returning as data field", provider);
                    return;
                }

                // Content is a JSON array (List) - wrap in {menu:[...]} structure
                if (contentObj instanceof java.util.List) {
                    try {
                        @SuppressWarnings("unchecked")
                        java.util.List<Object> contentList = (java.util.List<Object>) contentObj;
                        Map<String, Object> wrappedData = new java.util.HashMap<>();
                        wrappedData.put("menu", contentList);
                        response.set("code", 200);
                        response.set("success", true);
                        response.set("data", wrappedData);
                        response.set("provider", provider);
                        response.set("message", uiTextByLang(
                            uiLang,
                            "Thành công",
                            "Success",
                            "成功"));
                        logger.info("✅ AI returned JSON array from provider: {} - wrapped as {{menu:[]}} structure", provider);
                        return;
                    } catch (Exception listEx) {
                        logger.warn("Failed to wrap List content from provider {}: {}", provider, listEx.getMessage());
                    }
                }

                // Content is string - try to parse it
                String contentStr = contentObj.toString();
                logger.info("🔍 Processing string content from provider: {}, length: {} chars", provider, contentStr.length());
                
                // Provider may return pure JSON or markdown-wrapped JSON
                Map<String, Object> parsedData = null;
                
                // Strategy 1: Try direct parse (for pure JSON)
                parsedData = tryParseJson(contentStr.trim(), provider);
                
                if (parsedData == null) {
                    // Strategy 2: Try extracting from markdown
                    logger.debug("[{}] Direct parse failed, trying markdown extraction", provider);
                    parsedData = extractAndParseJson(contentStr, provider);
                }
                
                if (parsedData != null) {
                    // Successfully extracted and parsed JSON
                    response.set("code", 200);
                    response.set("success", true);
                    response.set("data", parsedData);
                    response.set("provider", provider);
                    response.set("message", uiTextByLang(
                        uiLang,
                        "Thành công",
                        "Success",
                        "成功"));
                    logger.info("✅ Successfully parsed JSON content from provider: {} - returning as data field", provider);
                    return;
                }
                
                // Could not extract valid JSON - return error to enforce strict JSON output
                logger.warn("❌ No valid JSON found in AI content from {} - returning error", provider);
                
                // But check if message contains markdown JSON block - try to extract it
                String messageContent = contentStr;
                Map<String, Object> extractedJson = null;
                
                // Try to extract JSON from markdown if content looks like it has JSON wrapped in ```
                if (contentStr.contains("```json") || (contentStr.contains("```") && contentStr.contains("{"))) {
                    logger.debug("[{}] Detected markdown JSON block in message, attempting extraction", provider);
                    String cleanedMarkdown = cleanMarkdownFromJson(contentStr);
                    if (cleanedMarkdown != null && !cleanedMarkdown.trim().isEmpty()) {
                        extractedJson = tryParseJson(cleanedMarkdown.trim(), provider);
                        if (extractedJson != null) {
                            logger.info("[{}] ✅ Successfully extracted JSON from markdown block in message", provider);
                            response.set("code", 200);
                            response.set("success", true);
                            response.set("data", extractedJson);
                            response.set("provider", provider);
                            response.set("message", uiTextByLang(
                                uiLang,
                                "Thành công",
                                "Success",
                                "成功"));
                            return;
                        }
                    }
                }
                
                response.set("code", 200);
                response.set("success", false);
                response.set("message", uiTextByLang(
                    uiLang,
                    "AI trả về dữ liệu không phải JSON hợp lệ",
                    "AI returned data that is not valid JSON",
                    "AI 返回的数据不是有效 JSON"));
                response.set("provider", provider);
                response.set("rawContent", messageContent);
                return;
            }

            // Fallback: no provider wrapper, treat as direct content
            response.set("code", 200);
            response.set("success", true);
            response.set("data", parsedResult);
            response.set("message", uiTextByLang(
                uiLang,
                "Thành công",
                "Success",
                "成功"));
            
        } catch (JsonProcessingException e) {
            // Try cleaning markdown as fallback
            logger.warn("Initial JSON parse failed, trying markdown cleanup: {}", e.getMessage());
            String cleanContent = cleanMarkdownFromJson(rawContent);
            
            if (cleanContent == null || cleanContent.isEmpty()) {
                response.set("code", 200);
                response.set("success", false);
                response.set("message", uiTextByLang(
                    uiLang,
                    "Không thể parse response từ AI: " + e.getMessage(),
                    "Unable to parse AI response: " + e.getMessage(),
                    "无法解析 AI 响应：" + e.getMessage()));
                logger.error("Failed to parse AI response and no valid content found");
                return;
            }
            
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> dynamicResult = objectMapper.readValue(cleanContent, Map.class);
                response.set("code", 200);
                response.set("success", true);
                response.set("data", dynamicResult);
                response.set("message", uiTextByLang(
                    uiLang,
                    "Thành công",
                    "Success",
                    "成功"));
            } catch (JsonProcessingException e2) {
                // Try escaping newlines in JSON as last resort
                logger.warn("JSON parse failed after markdown cleanup, trying to escape newlines: {}", e2.getMessage());
                String escapedContent = escapeNewlinesInJson(cleanContent);
                
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> dynamicResult = objectMapper.readValue(escapedContent, Map.class);
                    response.set("code", 200);
                    response.set("success", true);
                    response.set("data", dynamicResult);
                    response.set("message", uiTextByLang(
                        uiLang,
                        "Thành công",
                        "Success",
                        "成功"));
                    logger.info("✅ Successfully parsed JSON after escaping newlines");
                } catch (JsonProcessingException e3) {
                    // Final fallback: return raw content as text if JSON parsing fails completely
                    logger.warn("JSON parsing failed all attempts, trying final extraction from markdown");
                    
                    // Last attempt: try to extract JSON from markdown block in cleaned content
                    if (cleanContent != null && cleanContent.contains("```")) {
                        logger.info("Attempting JSON extraction from markdown block as last resort");
                        Map<String, Object> lastAttemptJson = tryParseJson(cleanContent.trim(), "lastFallback");
                        if (lastAttemptJson != null) {
                            response.set("code", 200);
                            response.set("success", true);
                            response.set("data", lastAttemptJson);
                            response.set("message", uiTextByLang(
                                uiLang,
                                "Thành công (trích xuất từ markdown)",
                                "Success (extracted from markdown)",
                                "成功（从 markdown 提取）"));
                            logger.info("✅ Last attempt succeeded - extracted JSON from markdown");
                            return;
                        }
                    }
                    
                    // Strict JSON: return error if parsing failed after all attempts
                    response.set("code", 200);
                    response.set("success", false);
                    response.set("message", uiTextByLang(
                        uiLang,
                        "AI trả về dữ liệu không phải JSON hợp lệ",
                        "AI returned data that is not valid JSON",
                        "AI 返回的数据不是有效 JSON"));
                    response.set("rawContent", rawContent);
                    logger.warn("❌ Returning error from AI service - JSON parse failed after all attempts (length: {} chars)", 
                        rawContent.length());
                }
            }
        }
    }

    private void handleAiAsyncSubmit(StandardResponse response, String prompt, Map<String, Object> params) {
        String uiLang = resolveClientUiLanguage(params);
        if (prompt == null || prompt.isEmpty()) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Thiếu tham số 'prompt' để tạo nội dung AI.",
                "Missing 'prompt' parameter to generate AI content.",
                "缺少用于生成 AI 内容的 'prompt' 参数。"));
            return;
        }

        if (prompt.length() > maxPromptChars) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Prompt quá dài (tối đa " + maxPromptChars + " ký tự), hiện tại: " + prompt.length(),
                "Prompt is too long (max " + maxPromptChars + " chars), current: " + prompt.length(),
                "Prompt 过长（最大 " + maxPromptChars + " 字符），当前：" + prompt.length()));
            response.set("errorCode", "PROMPT_EXCEEDS_ENDPOINT_LIMIT");
            return;
        }

        cleanupExpiredAiJobs();

        String jobId = "ai-job-" + UUID.randomUUID();
        Map<String, Object> job = new ConcurrentHashMap<>();
        long now = System.currentTimeMillis();
        job.put("jobId", jobId);
        job.put("status", "queued");
        job.put("realtimeAppId", String.valueOf(params.getOrDefault("realtimeAppId", params.getOrDefault("appId", ""))).trim());
        job.put("realtimeTaskType", String.valueOf(params.getOrDefault("taskType", "ai_async_job")).trim());
        job.put("createdAt", now);
        job.put("updatedAt", now);
        job.put("cancelled", false);
        job.put("_lastDraftText", "");
        job.put("pollAfterMs", aiAsyncPollMinMs);
        job.put("progress", createAiJobProgress("queued", uiTextByLang(
            uiLang,
            "Đang xếp hàng xử lý AI",
            "Queued for AI processing",
            "AI 处理排队中"), 0, 1, null));
        aiAsyncJobs.put(jobId, job);

        aiAsyncExecutor.submit(() -> {
            try {
                if (isAiJobCancelled(job)) {
                    return;
                }
                job.put("status", "running");
                job.put("updatedAt", System.currentTimeMillis());
                updateAiAsyncJobProgress(job, createAiJobProgress("starting", uiTextByLang(
                    uiLang,
                    "Bắt đầu xử lý yêu cầu AI",
                    "Starting AI request processing",
                    "开始处理 AI 请求"), 0, 1, null));

                StandardResponse syncResponse = new StandardResponse();
                String rawContent = fetchAiRawContentWithMenuRecovery(prompt, progress -> {
                    if (!isAiJobCancelled(job)) {
                        Map<String, Object> mergedProgress = enrichAiProgressWithMergePreview(progress, params);
                        updateAiAsyncJobProgress(job, enrichAiProgressWithLineTextEdits(mergedProgress, job));
                    }
                }, params);
                if (isAiJobCancelled(job)) {
                    return;
                }
                if (rawContent == null || rawContent.isBlank()) {
                    syncResponse.set("code", 200);
                    syncResponse.set("success", false);
                    syncResponse.set("message", uiTextByLang(
                        uiLang,
                        "Không nhận được nội dung hợp lệ từ dịch vụ AI.",
                        "No valid content received from AI service.",
                        "未收到来自 AI 服务的有效内容。"));
                } else {
                    if (shouldExposeRoutingDebug(params)) {
                        Object routingDecision = params != null ? params.get("_providerRoutingDecision") : null;
                        if (routingDecision != null) {
                            syncResponse.set("providerRoutingDecision", routingDecision);
                        }
                    }
                    // Persist session context file for next AI call continuity
                    try {
                        String promptAppId = this.aiAssistantGatewayService.extractAppIdFromPrompt(prompt);
                        if (promptAppId != null && !promptAppId.isBlank()) {
                            String requestText = extractRequestTextFromPrompt(prompt);
                            this.aiAssistantGatewayService.updateAppContextFile(promptAppId, requestText, rawContent);
                        }
                    } catch (Exception ctxEx) {
                        logger.warn("Could not update AI context file (async): {}", ctxEx.getMessage());
                    }
                    updateAiAsyncJobProgress(job, createAiJobProgress("parsing", uiTextByLang(
                        uiLang,
                        "Đang phân tích kết quả AI",
                        "Parsing AI result",
                        "正在解析 AI 结果"), 1, 1, null));
                    populateAiResponseFromRawContent(syncResponse, rawContent, uiLang);
                }

                Map<String, Object> resultPayload = new HashMap<>(syncResponse.getPropertiesMap());
                enrichAiResultWithMergePreview(resultPayload, params);
                if (isAiJobCancelled(job)) {
                    return;
                }
                boolean ok = Boolean.TRUE.equals(resultPayload.get("success"));
                job.put("status", ok ? "completed" : "failed");
                job.put("result", resultPayload);
                job.put("updatedAt", System.currentTimeMillis());
                job.put("completedAt", System.currentTimeMillis());
                updateAiAsyncJobProgress(job, createAiJobProgress(ok ? "completed" : "failed",
                    ok ? uiTextByLang(
                        uiLang,
                        "Đã hoàn tất tạo menu AI",
                        "AI generation completed",
                        "AI 生成已完成")
                       : String.valueOf(resultPayload.getOrDefault("message", uiTextByLang(
                        uiLang,
                        "AI xử lý thất bại",
                        "AI processing failed",
                        "AI 处理失败"))),
                        1, 1, null));
                emitAiAsyncJobSocketEvent(job, "ai_job_result", resultPayload);
            } catch (Exception e) {
                if (isAiJobCancelled(job)) {
                    return;
                }
                logger.error("Async AI job failed: {}", jobId, e);
                job.put("status", "failed");
                job.put("updatedAt", System.currentTimeMillis());
                job.put("completedAt", System.currentTimeMillis());
                updateAiAsyncJobProgress(job, createAiJobProgress("failed", uiTextByLang(
                    uiLang,
                    "Lỗi xử lý async AI: " + e.getMessage(),
                    "Async AI processing error: " + e.getMessage(),
                    "异步 AI 处理错误：" + e.getMessage()), 1, 1, null));
                job.put("result", Map.of(
                        "code", 200,
                        "success", false,
                        "message", uiTextByLang(
                            uiLang,
                            "Lỗi xử lý async AI: " + e.getMessage(),
                            "Async AI processing error: " + e.getMessage(),
                            "异步 AI 处理错误：" + e.getMessage()),
                        "errorCode", "ASYNC_AI_JOB_ERROR"));
                emitAiAsyncJobSocketEvent(job, "ai_job_result", job.get("result"));
            }
        });

        response.set("code", 200);
        response.set("success", true);
        response.set("message", uiTextByLang(
            uiLang,
            "Đã nhận yêu cầu AI, đang xử lý nền",
            "AI request received and processing in background",
            "已收到 AI 请求，正在后台处理"));
        response.set("data", Map.of(
                "jobId", jobId,
                "status", "queued",
            "pollAfterMs", aiAsyncPollMinMs,
            "progress", job.get("progress")));
    }

    private void handleAiAsyncStatus(StandardResponse response, Map<String, Object> params) {
        String uiLang = resolveClientUiLanguage(params);
        cleanupExpiredAiJobs();
        String jobId = String.valueOf(params.getOrDefault("jobId", "")).trim();
        if (jobId.isEmpty()) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Thiếu tham số jobId",
                "Missing jobId parameter",
                "缺少 jobId 参数"));
            response.set("errorCode", "ASYNC_JOB_ID_REQUIRED");
            return;
        }

        Map<String, Object> job = aiAsyncJobs.get(jobId);
        if (job == null) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Không tìm thấy job hoặc job đã hết hạn",
                "Job not found or expired",
                "未找到任务或任务已过期"));
            response.set("errorCode", "ASYNC_JOB_NOT_FOUND");
            return;
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("jobId", jobId);
        payload.put("status", job.getOrDefault("status", "unknown"));
        payload.put("createdAt", job.get("createdAt"));
        payload.put("updatedAt", job.get("updatedAt"));
        payload.put("pollAfterMs", job.getOrDefault("pollAfterMs", aiAsyncPollMinMs));
        payload.put("elapsedMs", System.currentTimeMillis() - ((Number) job.getOrDefault("createdAt", System.currentTimeMillis())).longValue());
        if (job.containsKey("progress")) {
            payload.put("progress", job.get("progress"));
        }
        if (job.containsKey("completedAt")) {
            payload.put("completedAt", job.get("completedAt"));
        }
        if (job.containsKey("result")) {
            payload.put("result", job.get("result"));
        }

        response.set("code", 200);
        response.set("success", true);
        response.set("message", uiTextByLang(
            uiLang,
            "OK",
            "OK",
            "OK"));
        response.set("data", payload);
    }

    private void handleAiAsyncCancel(StandardResponse response, Map<String, Object> params) {
        String uiLang = resolveClientUiLanguage(params);
        cleanupExpiredAiJobs();
        String jobId = String.valueOf(params.getOrDefault("jobId", "")).trim();
        if (jobId.isEmpty()) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Thiếu tham số jobId",
                "Missing jobId parameter",
                "缺少 jobId 参数"));
            response.set("errorCode", "ASYNC_JOB_ID_REQUIRED");
            return;
        }

        Map<String, Object> job = aiAsyncJobs.get(jobId);
        if (job == null) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", uiTextByLang(
                uiLang,
                "Không tìm thấy job hoặc job đã hết hạn",
                "Job not found or expired",
                "未找到任务或任务已过期"));
            response.set("errorCode", "ASYNC_JOB_NOT_FOUND");
            return;
        }

        String status = String.valueOf(job.getOrDefault("status", "unknown")).toLowerCase();
        if ("completed".equals(status) || "failed".equals(status) || "cancelled".equals(status)) {
            response.set("code", 200);
            response.set("success", true);
            response.set("message", uiTextByLang(
                uiLang,
                "Job đã ở trạng thái kết thúc",
                "Job is already in a terminal state",
                "任务已处于结束状态"));
            response.set("data", Map.of(
                    "jobId", jobId,
                    "status", status));
            return;
        }

        job.put("cancelled", true);
        job.put("status", "cancelled");
        job.put("updatedAt", System.currentTimeMillis());
        job.put("completedAt", System.currentTimeMillis());
        updateAiAsyncJobProgress(job, createAiJobProgress("cancelled", uiTextByLang(
            uiLang,
            "Đã dừng theo yêu cầu người dùng",
            "Stopped by user request",
            "已按用户请求停止"), 1, 1, null));
        Map<String, Object> cancelResult = new HashMap<>();
        cancelResult.put("code", 200);
        cancelResult.put("success", false);
        cancelResult.put("message", uiTextByLang(
            uiLang,
            "AI job đã được dừng theo yêu cầu",
            "AI job was stopped by request",
            "AI 任务已按请求停止"));
        cancelResult.put("errorCode", "ASYNC_JOB_CANCELLED");
        job.put("result", cancelResult);
        emitAiAsyncJobSocketEvent(job, "ai_job_result", cancelResult);

        response.set("code", 200);
        response.set("success", true);
        response.set("message", uiTextByLang(
            uiLang,
            "Đã gửi yêu cầu dừng AI job",
            "Stop request for AI job has been sent",
            "已发送停止 AI 任务请求"));
        response.set("data", Map.of(
                "jobId", jobId,
                "status", "cancelled"));
    }

    private boolean isAiJobCancelled(Map<String, Object> job) {
        if (job == null) {
            return false;
        }
        if (Boolean.TRUE.equals(job.get("cancelled"))) {
            return true;
        }
        String status = String.valueOf(job.getOrDefault("status", "")).trim().toLowerCase();
        return "cancelled".equals(status);
    }

    private void cleanupExpiredAiJobs() {
        long now = System.currentTimeMillis();
        long ttl = Math.max(60000L, aiAsyncJobTtlMs);
        aiAsyncJobs.entrySet().removeIf(entry -> {
            Object createdObj = entry.getValue().get("createdAt");
            long createdAt = (createdObj instanceof Number) ? ((Number) createdObj).longValue() : now;
            return now - createdAt > ttl;
        });
    }

    private void updateAiAsyncJobProgress(Map<String, Object> job, Map<String, Object> progress) {
        if (job == null || progress == null) {
            return;
        }
        job.put("progress", new HashMap<>(progress));
        job.put("updatedAt", System.currentTimeMillis());
        emitAiAsyncJobSocketEvent(job, "ai_job_progress", null);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> enrichAiProgressWithMergePreview(Map<String, Object> progress, Map<String, Object> params) {
        if (progress == null) {
            return null;
        }

        Map<String, Object> enriched = new HashMap<>(progress);
        if (params == null) {
            return enriched;
        }

        String mergeScenario = String.valueOf(params.getOrDefault("mergeScenario", "")).trim();
        String mergeOldJson = String.valueOf(params.getOrDefault("mergeOldJson", "")).trim();
        if (mergeScenario.isEmpty() || mergeOldJson.isEmpty()) {
            return enriched;
        }

        Object draftObj = enriched.get("draftText");
        if (!(draftObj instanceof String draftText) || draftText.isBlank()) {
            return enriched;
        }

        try {
            Object parsedDraft = objectMapper.readValue(draftText, Object.class);
            AiMenuMergeService.MergeOutput mergeOut;
            if ("property_edit".equalsIgnoreCase(mergeScenario)) {
                Object nodeObj = parsedDraft;
                if (parsedDraft instanceof Map<?, ?> draftMap) {
                    Object directNode = draftMap.get("menu_node");
                    if (directNode != null) {
                        nodeObj = directNode;
                    }
                }
                mergeOut = aiMenuMergeService.mergeMenuNode(
                        mergeOldJson,
                        objectMapper.writeValueAsString(nodeObj));
            } else if ("incremental_update".equalsIgnoreCase(mergeScenario)) {
                mergeOut = aiMenuMergeService.diffMergeTrees(
                        mergeOldJson,
                        objectMapper.writeValueAsString(parsedDraft));
                if (mergeOut.mergedMenu != null && !mergeOut.mergedMenu.isEmpty()) {
                    Map<String, Object> normalizedDraft = new HashMap<>();
                    normalizedDraft.put("menu", mergeOut.mergedMenu);
                    if (parsedDraft instanceof Map<?, ?> draftMap) {
                        Object draftStage = draftMap.get("_draft_stage");
                        Object draftProgress = draftMap.get("_draft_progress");
                        if (draftStage != null) {
                            normalizedDraft.put("_draft_stage", draftStage);
                        }
                        if (draftProgress != null) {
                            normalizedDraft.put("_draft_progress", draftProgress);
                        }
                    }
                    enriched.put("draftText", objectMapper.writeValueAsString(normalizedDraft));
                }
            } else {
                return enriched;
            }

            Map<String, Object> mergePreview = objectMapper.convertValue(mergeOut, Map.class);
            enriched.put("_merge_preview", mergePreview);

            Object patchOps = mergePreview.get("patchOps");
            if (patchOps instanceof List && !((List<?>) patchOps).isEmpty()) {
                enriched.put("patchOps", patchOps);
            }

            logger.info("[REALTIME_MERGE_PREVIEW] stage={} scenario={} patchOps={} added={} edited={} deleted={}",
                    String.valueOf(enriched.getOrDefault("stage", "")),
                    mergeScenario,
                    mergeOut.patchOps == null ? 0 : mergeOut.patchOps.size(),
                    mergeOut.added,
                    mergeOut.edited,
                    mergeOut.deleted);
        } catch (Exception e) {
            logger.debug("Could not enrich realtime AI progress with merge preview: {}", e.getMessage());
        }

        return enriched;
    }

    @SuppressWarnings("unchecked")
    private void enrichAiResultWithMergePreview(Map<String, Object> resultPayload, Map<String, Object> params) {
        if (resultPayload == null || params == null) {
            return;
        }
        String mergeScenario = String.valueOf(params.getOrDefault("mergeScenario", "")).trim();
        String mergeOldJson = String.valueOf(params.getOrDefault("mergeOldJson", "")).trim();
        if (mergeScenario.isEmpty() || mergeOldJson.isEmpty()) {
            return;
        }
        Object dataObj = resultPayload.get("data");
        if (!(dataObj instanceof Map)) {
            return;
        }

        try {
            Map<String, Object> dataMap = (Map<String, Object>) dataObj;
            AiMenuMergeService.MergeOutput mergeOut;
            if ("property_edit".equalsIgnoreCase(mergeScenario)) {
                Object nodeObj = dataMap.get("menu_node");
                if (nodeObj == null) {
                    nodeObj = dataMap;
                }
                mergeOut = aiMenuMergeService.mergeMenuNode(
                        mergeOldJson,
                        objectMapper.writeValueAsString(nodeObj));
                if (mergeOut.mergedMenu != null && !mergeOut.mergedMenu.isEmpty()) {
                    dataMap.put("menu_node", mergeOut.mergedMenu.get(0));
                }
            } else if ("incremental_update".equalsIgnoreCase(mergeScenario)) {
                mergeOut = aiMenuMergeService.diffMergeTrees(
                        mergeOldJson,
                        objectMapper.writeValueAsString(dataMap));
                if (mergeOut.mergedMenu != null) {
                    dataMap.put("menu", mergeOut.mergedMenu);
                }
            } else {
                return;
            }
            dataMap.put("_merge_preview", objectMapper.convertValue(mergeOut, Map.class));
        } catch (Exception e) {
            logger.debug("Could not enrich AI result with merge preview: {}", e.getMessage());
        }
    }

    private void emitAiAsyncJobSocketEvent(Map<String, Object> job, String eventName, Object result) {
        if (job == null || eventName == null || eventName.isBlank() || socketIOServer == null) {
            return;
        }
        String room = String.valueOf(job.getOrDefault("realtimeAppId", "")).trim();
        if (room.isEmpty()) {
            return;
        }
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("jobId", job.get("jobId"));
            payload.put("status", job.getOrDefault("status", "unknown"));
            payload.put("taskType", job.getOrDefault("realtimeTaskType", "ai_async_job"));
            payload.put("appId", room);
            payload.put("updatedAt", job.get("updatedAt"));
            payload.put("createdAt", job.get("createdAt"));
            if (job.containsKey("progress")) {
                payload.put("progress", job.get("progress"));
            }
            if (result != null) {
                payload.put("result", result);
            } else if (job.containsKey("result")) {
                payload.put("result", job.get("result"));
            }
            socketIOServer.getRoomOperations(room).sendEvent(eventName, payload);
            if (containsAiPatchPayload(payload)) {
                socketIOServer.getRoomOperations(room).sendEvent("ai_job_patch", payload);
            }
        } catch (Exception e) {
            logger.debug("Failed to emit async AI socket event {}: {}", eventName, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private boolean containsAiPatchPayload(Map<String, Object> payload) {
        if (payload == null) {
            return false;
        }
        Object progressObj = payload.get("progress");
        if (progressObj instanceof Map) {
            Map<String, Object> progress = (Map<String, Object>) progressObj;
            if (progress.get("draftText") != null || progress.get("partialJson") != null || progress.get("previewJson") != null) {
                return true;
            }
            Object textEdits = progress.get("textEdits");
            Object patchOps = progress.get("patchOps");
            if ((textEdits instanceof java.util.List && !((java.util.List<?>) textEdits).isEmpty())
                    || (patchOps instanceof java.util.List && !((java.util.List<?>) patchOps).isEmpty())) {
                return true;
            }
        }

        Object resultObj = payload.get("result");
        if (resultObj instanceof Map) {
            Map<String, Object> result = (Map<String, Object>) resultObj;
            if (result.get("draftText") != null) {
                return true;
            }
            Object nestedData = result.get("data");
            if (nestedData instanceof Map && ((Map<?, ?>) nestedData).get("_merge_preview") != null) {
                return true;
            }
            if (result.get("_merge_preview") != null) {
                return true;
            }
        }
        return false;
    }

    private Map<String, Object> createAiJobProgress(String stage, String message, int current, int total, Map<String, Object> extra) {
        Map<String, Object> progress = new HashMap<>();
        progress.put("stage", stage);
        progress.put("message", message);
        progress.put("current", Math.max(0, current));
        progress.put("total", Math.max(1, total));
        int safeTotal = Math.max(1, total);
        int safeCurrent = Math.max(0, Math.min(current, safeTotal));
        progress.put("percent", Math.max(0, Math.min(100, (int) Math.round((safeCurrent * 100.0) / safeTotal))));
        if (extra != null && !extra.isEmpty()) {
            progress.putAll(extra);
        }
        return progress;
    }

    private Map<String, Object> enrichAiProgressWithLineTextEdits(Map<String, Object> progress, Map<String, Object> job) {
        if (progress == null) {
            return null;
        }
        if (job == null) {
            return progress;
        }

        String nextDraft = extractRealtimeDraftText(progress);
        if (nextDraft.isBlank()) {
            return progress;
        }

        String previousDraft = String.valueOf(job.getOrDefault("_lastDraftText", ""));
        if (nextDraft.equals(previousDraft)) {
            return progress;
        }

        List<Map<String, Object>> generated = buildLineTextEdits(previousDraft, nextDraft);
        job.put("_lastDraftText", nextDraft);
        if (generated.isEmpty()) {
            return progress;
        }

        Object existingTextEdits = progress.get("textEdits");
        Object existingLineRanges = progress.get("lineRanges");
        Object existingChangedRanges = progress.get("changedRanges");
        if ((existingTextEdits instanceof List && !((List<?>) existingTextEdits).isEmpty())
                || (existingLineRanges instanceof List && !((List<?>) existingLineRanges).isEmpty())
                || (existingChangedRanges instanceof List && !((List<?>) existingChangedRanges).isEmpty())) {
            return progress;
        }

        Map<String, Object> enriched = new HashMap<>(progress);
        enriched.put("textEdits", generated);
        List<Map<String, Object>> ranges = convertTextEditsToLineRanges(generated);
        if (!ranges.isEmpty()) {
            enriched.put("lineRanges", ranges);
            enriched.put("changedRanges", ranges);
        }
        return enriched;
    }

    private String extractRealtimeDraftText(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return "";
        }
        String[] keys = new String[] {
            "draftText", "partialJson", "previewJson", "draftCode", "partialCode", "previewCode", "code"
        };
        for (String key : keys) {
            Object value = payload.get(key);
            if (value instanceof String) {
                String text = (String) value;
                if (!text.isBlank()) {
                    return text;
                }
            }
        }
        return "";
    }

    private List<Map<String, Object>> buildLineTextEdits(String beforeText, String afterText) {
        String oldText = beforeText == null ? "" : beforeText;
        String newText = afterText == null ? "" : afterText;
        if (newText.equals(oldText)) {
            return Collections.emptyList();
        }

        String[] oldLines = oldText.split("\\n", -1);
        String[] newLines = newText.split("\\n", -1);

        int prefix = 0;
        int minLen = Math.min(oldLines.length, newLines.length);
        while (prefix < minLen && oldLines[prefix].equals(newLines[prefix])) {
            prefix++;
        }

        int oldSuffix = oldLines.length - 1;
        int newSuffix = newLines.length - 1;
        while (oldSuffix >= prefix && newSuffix >= prefix && oldLines[oldSuffix].equals(newLines[newSuffix])) {
            oldSuffix--;
            newSuffix--;
        }

        int oldChangedCount = oldSuffix >= prefix ? (oldSuffix - prefix + 1) : 0;
        int newChangedCount = newSuffix >= prefix ? (newSuffix - prefix + 1) : 0;
        if (oldChangedCount == 0 && newChangedCount == 0) {
            return Collections.emptyList();
        }

        int startLine = prefix + 1;
        int endLine = oldChangedCount > 0 ? (oldSuffix + 1) : startLine;
        String replacement = newChangedCount > 0
            ? String.join("\n", Arrays.copyOfRange(newLines, prefix, newSuffix + 1))
            : "";

        String action;
        if (oldChangedCount == 0 && newChangedCount > 0) {
            action = "add";
        } else if (newChangedCount == 0 && oldChangedCount > 0) {
            action = "delete";
        } else {
            action = "edit";
        }

        Map<String, Object> edit = new HashMap<>();
        edit.put("startLine", startLine);
        edit.put("endLine", Math.max(startLine, endLine));
        edit.put("replacement", replacement);
        edit.put("action", action);

        return List.of(edit);
    }

    private List<Map<String, Object>> convertTextEditsToLineRanges(List<Map<String, Object>> textEdits) {
        if (textEdits == null || textEdits.isEmpty()) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> ranges = new ArrayList<>();
        for (Map<String, Object> edit : textEdits) {
            if (edit == null) continue;
            int startLine = parseIntOrDefault(edit.get("startLine"), 1);
            int endLine = Math.max(startLine, parseIntOrDefault(edit.get("endLine"), startLine));
            String action = String.valueOf(edit.getOrDefault("action", "edit"));

            Map<String, Object> range = new HashMap<>();
            range.put("startLine", startLine);
            range.put("endLine", endLine);
            range.put("fromLine", startLine);
            range.put("toLine", endLine);
            range.put("action", action);
            range.put("type", action);
            ranges.add(range);
        }
        return ranges;
    }

    private int parseIntOrDefault(Object raw, int fallback) {
        if (raw instanceof Number) {
            return ((Number) raw).intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(raw));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static class StructuredAiAssistantEditResult {
        boolean valid = false;
        Object understandingChecklist;
        String assistantMessage = "";
        List<Map<String, Object>> textEdits = new ArrayList<>();
    }

    private StructuredAiAssistantEditResult extractStructuredAiAssistantEdits(String rawResponse, int baseLineCount) {
        StructuredAiAssistantEditResult result = new StructuredAiAssistantEditResult();
        String raw = String.valueOf(rawResponse == null ? "" : rawResponse).trim();
        if (raw.isEmpty()) {
            return result;
        }

        String cleaned = cleanMarkdownFromJson(raw);
        if (cleaned == null || cleaned.isBlank()) {
            return result;
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(cleaned.trim(), Map.class);

            Object checklist = parsed.get("understanding_checklist");
            if (checklist == null) {
                checklist = parsed.get("understandingChecklist");
            }
            result.understandingChecklist = checklist;

            Object assistantMsg = parsed.get("assistant_message");
            if (assistantMsg == null) {
                assistantMsg = parsed.get("assistantMessage");
            }
            if (assistantMsg != null) {
                result.assistantMessage = String.valueOf(assistantMsg).trim();
            }

            Object editsRaw = parsed.get("text_edits");
            if (editsRaw == null) {
                editsRaw = parsed.get("textEdits");
            }
            if (editsRaw == null) {
                editsRaw = parsed.get("edits");
            }

            int maxEdits = Math.max(1, aiAssistantStructuredEditMaxTextEdits);
            if (editsRaw instanceof List<?> list) {
                for (Object item : list) {
                    if (!(item instanceof Map<?, ?> map)) {
                        continue;
                    }
                    int startLine = parseIntOrDefault(
                        map.get("startLine") != null ? map.get("startLine") : map.get("start_line"),
                        parseIntOrDefault(map.get("line"), 1));

                    Object endSource = map.get("endLine") != null ? map.get("endLine") : map.get("end_line");
                    int endLine = parseIntOrDefault(endSource, startLine);

                    if (map.get("range") instanceof Map<?, ?> range) {
                        if (range.get("startLine") != null) {
                            startLine = parseIntOrDefault(range.get("startLine"), startLine);
                        }
                        if (range.get("endLine") != null) {
                            endLine = parseIntOrDefault(range.get("endLine"), endLine);
                        }
                    }

                    if (startLine < 1) {
                        startLine = 1;
                    }
                    if (endLine < startLine) {
                        endLine = startLine;
                    }
                    if (baseLineCount > 0) {
                        int maxLine = Math.max(1, baseLineCount + 1);
                        startLine = Math.min(startLine, maxLine);
                        endLine = Math.min(endLine, maxLine);
                    }

                    Object replacementObj = map.get("replacement") != null
                        ? map.get("replacement")
                        : (map.get("newText") != null ? map.get("newText") : map.get("text"));
                    String replacement = String.valueOf(replacementObj == null ? "" : replacementObj);

                    Object actionObj = map.get("action");
                    String action = String.valueOf(actionObj == null ? "edit" : actionObj).trim().toLowerCase();
                    if (action.isBlank()) {
                        action = "edit";
                    }

                    Map<String, Object> normalized = new HashMap<>();
                    normalized.put("startLine", startLine);
                    normalized.put("endLine", endLine);
                    normalized.put("replacement", replacement);
                    normalized.put("action", action);
                    result.textEdits.add(normalized);

                    if (result.textEdits.size() >= maxEdits) {
                        break;
                    }
                }
            }

            result.valid = validateStructuredEditEntries(result, baseLineCount);
            return result;
        } catch (Exception ignored) {
            return result;
        }
    }

    private boolean validateStructuredEditEntries(StructuredAiAssistantEditResult result, int baseLineCount) {
        if (result == null || result.textEdits == null || result.textEdits.isEmpty()) {
            return false;
        }
        if (aiAssistantStructuredEditRequireChecklist && result.understandingChecklist == null) {
            return false;
        }

        List<Map<String, Object>> normalized = new ArrayList<>(result.textEdits);
        normalized.sort((a, b) -> {
            int sa = parseIntOrDefault(a.get("startLine"), 1);
            int sb = parseIntOrDefault(b.get("startLine"), 1);
            if (sa != sb) return Integer.compare(sa, sb);
            int ea = parseIntOrDefault(a.get("endLine"), sa);
            int eb = parseIntOrDefault(b.get("endLine"), sb);
            return Integer.compare(ea, eb);
        });

        int maxAllowedLine = Math.max(1, baseLineCount + 1);
        int previousEnd = 0;
        int totalReplacementChars = 0;

        for (Map<String, Object> edit : normalized) {
            int startLine = parseIntOrDefault(edit.get("startLine"), 1);
            int endLine = parseIntOrDefault(edit.get("endLine"), startLine);

            if (startLine < 1 || endLine < startLine) {
                return false;
            }
            if (startLine > maxAllowedLine || endLine > maxAllowedLine) {
                return false;
            }
            if (startLine <= previousEnd) {
                return false;
            }

            String replacement = String.valueOf(edit.getOrDefault("replacement", ""));
            totalReplacementChars += replacement.length();
            if (totalReplacementChars > Math.max(20000, aiAssistantStructuredEditMaxReplacementChars)) {
                return false;
            }

            previousEnd = endLine;
        }

        result.textEdits = normalized;
        return true;
    }

    private int countLines(String text) {
        if (text == null || text.isEmpty()) {
            return 0;
        }
        return text.split("\\n", -1).length;
    }

    /**
     * Làm sạch chuỗi JSON thô bằng cách loại bỏ các ký tự markdown bao quanh.
     *
     * <p>
     * Phương thức này tìm kiếm dấu ngoặc nhọn đầu tiên và cuối cùng trong chuỗi để
     * trích xuất phần
     * nội dung JSON, phòng trường hợp API trả về JSON được bọc trong khối mã
     * markdown (ví dụ:
     * ```json...```).
     *
     * @param rawContent chuỗi thô nhận được từ API.
     * @return một chuỗi chỉ chứa nội dung JSON, hoặc {@code null} nếu đầu vào là
     *         null/trống.
     */
    private String cleanMarkdownFromJson(String rawContent) {
        if (rawContent == null || rawContent.trim().isEmpty()) {
            return null;
        }

        // First, try to extract JSON from markdown code block (```json ... ```)
        int jsonBlockStart = rawContent.indexOf("```json");
        if (jsonBlockStart != -1) {
            int contentStart = rawContent.indexOf('\n', jsonBlockStart);
            if (contentStart != -1) {
                int jsonBlockEnd = rawContent.indexOf("```", contentStart);
                if (jsonBlockEnd != -1) {
                    String extracted = rawContent.substring(contentStart + 1, jsonBlockEnd).trim();
                    logger.debug("Extracted JSON from markdown block, length: {}", extracted.length());
                    return extracted;
                }
            }
        }
        
        // Also try generic code block (``` ... ```)
        int codeBlockStart = rawContent.indexOf("```");
        if (codeBlockStart != -1) {
            int contentStart = rawContent.indexOf('\n', codeBlockStart);
            if (contentStart != -1) {
                int codeBlockEnd = rawContent.indexOf("```", contentStart);
                if (codeBlockEnd != -1) {
                    String extracted = rawContent.substring(contentStart + 1, codeBlockEnd).trim();
                    // Verify it's JSON by checking if it starts with {
                    if (extracted.startsWith("{")) {
                        logger.debug("Extracted JSON from generic code block, length: {}", extracted.length());
                        return extracted;
                    }
                }
            }
        }

        // Fallback: find first { and matching }
        int firstBrace = rawContent.indexOf('{');
        
        if (firstBrace != -1) {
            // Find matching closing brace
            int matchingBrace = findMatchingBrace(rawContent, firstBrace);
            if (matchingBrace != -1) {
                String extracted = rawContent.substring(firstBrace, matchingBrace + 1);
                logger.debug("Extracted JSON using brace matching, length: {}", extracted.length());
                return extracted;
            }
        }

        logger.warn("Could not extract JSON from content");
        return rawContent;
    }

    /**
     * Extract and parse JSON from AI response content.
     * This method handles legacy responses with markdown formatting.
     * 
    * Note: Provider may return pure JSON or markdown-wrapped JSON,
    * so this method is mainly for markdown-wrapped responses.
     * 
     * @param contentStr Raw content from AI provider
     * @param provider Provider name for logging
     * @return Parsed JSON as Map, or null if no valid JSON found
     */
    private Map<String, Object> extractAndParseJson(String contentStr, String provider) {
        if (contentStr == null || contentStr.trim().isEmpty()) {
            logger.warn("[{}] Empty content provided to extractAndParseJson", provider);
            return null;
        }
        
        // Strategy 1: Try to extract from markdown code block first
        String cleanedContent = cleanMarkdownFromJson(contentStr);
        if (cleanedContent != null && !cleanedContent.isEmpty()) {
            String trimmedContent = cleanedContent.trim();
            
            logger.debug("[{}] Cleaned content length: {}, starts with '{{': {}", 
                provider, trimmedContent.length(), trimmedContent.startsWith("{"));
            
            // Check for truncation indicators
            if (trimmedContent.contains("...") || trimmedContent.contains("(nội dung như trên)") || 
                trimmedContent.contains("(nội dung tiếng") || trimmedContent.contains("省略")) {
                logger.warn("[{}] ⚠️ Detected truncated/summarized content - AI may have abbreviated the response", provider);
            }
            
            // Strategy 2: Try to parse the cleaned content
            Map<String, Object> parsed = tryParseJson(trimmedContent, provider);
            if (parsed != null) {
                // Validate content quality
                validateContentQuality(parsed, provider);
                return parsed;
            }
        }
        
        // Strategy 3: If cleanMarkdownFromJson failed, try to find JSON object manually
        // Look for first { and last } in the original content
        int firstBrace = contentStr.indexOf('{');
        int lastBrace = contentStr.lastIndexOf('}');
        
        if (firstBrace != -1 && lastBrace != -1 && lastBrace > firstBrace) {
            String extracted = contentStr.substring(firstBrace, lastBrace + 1);
            logger.debug("[{}] Extracted JSON manually from content (length: {})", provider, extracted.length());
            
            Map<String, Object> parsed = tryParseJson(extracted, provider);
            if (parsed != null) {
                validateContentQuality(parsed, provider);
                return parsed;
            }
        }
        
        logger.warn("[{}] ❌ Could not extract valid JSON from content after trying all strategies", provider);
        return null;
    }
    
    /**
     * Try to parse JSON string into Map.
     * 
     * @param jsonStr JSON string to parse
     * @param provider Provider name for logging
     * @return Parsed Map or null if parsing failed
     */
    private Map<String, Object> tryParseJson(String jsonStr, String provider) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) {
            return null;
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> result = objectMapper.readValue(jsonStr, Map.class);
            logger.info("[{}] ✅ Successfully parsed JSON (keys: {})", provider, result.keySet());
            return result;
        } catch (JsonProcessingException e) {
            logger.debug("[{}] Failed to parse JSON as Map: {}. First 200 chars: {}",
                provider, e.getMessage(),
                jsonStr.substring(0, Math.min(200, jsonStr.length())));

            // Try parsing as a JSON array -> wrap in {menu:[...]}
            String trimmed = jsonStr.trim();
            if (trimmed.startsWith("[")) {
                try {
                    @SuppressWarnings("unchecked")
                    java.util.List<Object> list = objectMapper.readValue(trimmed, java.util.List.class);
                    Map<String, Object> wrapped = new java.util.HashMap<>();
                    wrapped.put("menu", list);
                    logger.info("[{}] ✅ Parsed JSON array and wrapped as {{menu:[]}} (size: {})", provider, list.size());
                    return wrapped;
                } catch (JsonProcessingException ea) {
                    logger.debug("[{}] Array parse failed: {}", provider, ea.getMessage());
                }
            }

            String normalized = normalizeJsonString(jsonStr);
            if (!normalized.equals(jsonStr)) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> retry = objectMapper.readValue(normalized, Map.class);
                    logger.info("[{}] ✅ Successfully parsed JSON after normalization (keys: {})", provider, retry.keySet());
                    return retry;
                } catch (JsonProcessingException e2) {
                    logger.debug("[{}] Normalized parse failed: {}", provider, e2.getMessage());
                }
            }

            return null;
        }
    }

    private String normalizeJsonString(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) {
            return jsonStr;
        }

        String normalized = jsonStr;
        normalized = normalized.replace("\uFEFF", "");
        normalized = normalized.replace("\u201C", "\"");
        normalized = normalized.replace("\u201D", "\"");
        normalized = normalized.replace("\u2018", "'");
        normalized = normalized.replace("\u2019", "'");
        normalized = normalized.replaceAll(",\\s*([}\\]])", "$1");
        normalized = escapeNewlinesInJson(normalized);

        return normalized;
    }
    
    /**
     * Validate quality of parsed content.
     * Warns about truncated or incomplete content.
     * 
     * @param parsedData Parsed JSON data
     * @param provider Provider name for logging
     */
    private void validateContentQuality(Map<String, Object> parsedData, String provider) {
        // Check for incomplete content fields
        Object contentField = parsedData.get("content");
        if (contentField instanceof String) {
            String fieldValue = (String) contentField;
            if (fieldValue.contains("...") || fieldValue.contains("(nội dung như trên)")) {
                logger.warn("[{}] ⚠️ Content field contains truncation indicators", provider);
            }
            if (fieldValue.length() < 100) {
                logger.warn("[{}] ⚠️ Content field appears too short ({} chars)", provider, fieldValue.length());
            }
        }
        
        // Check content_en and content_zh too
        for (String key : new String[]{"content_en", "content_zh"}) {
            Object field = parsedData.get(key);
            if (field instanceof String) {
                String value = (String) field;
                if (value.contains("...") || value.length() < 50) {
                    logger.warn("[{}] ⚠️ Field '{}' appears truncated or too short ({} chars)", 
                        provider, key, value.length());
                }
            }
        }
    }

    private void handleWebScrape(StandardResponse response, Map<String, Object> params) {
        String link = (String) params.get("link");
        if (link == null || link.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'link' parameter for web scraping.");
            return;
        }

        Map<String, String> proxyConfig = null;
        if (params.containsKey("proxyServer")) {
            proxyConfig = new HashMap<>();
            proxyConfig.put("server", (String) params.get("proxyServer"));
            if (params.containsKey("proxyUsername")) {
                proxyConfig.put("username", (String) params.get("proxyUsername"));
            }
            if (params.containsKey("proxyPassword")) {
                proxyConfig.put("password", (String) params.get("proxyPassword"));
            }
        }

        // Lấy các tham số tùy chọn khác
        boolean listenToConsole = Boolean.parseBoolean(String.valueOf(params.getOrDefault("listenToConsole", "false")));
        boolean useIncognito = Boolean.parseBoolean(String.valueOf(params.getOrDefault("useIncognito", "false")));
        String onPageLoadedScript = (String) params.get("onPageLoadedScript");
        String scriptToExecute = (String) params.get("scriptToExecute");

        logger.info("Scraping URL: {} with proxy: {}, incognito: {}, console: {}", link, proxyConfig != null,
                useIncognito, listenToConsole);

        try {
            String htmlContent = webScraperService.getHtmlContentInternal(
                    link,
                    proxyConfig,
                    scriptToExecute, // Script để thực thi sau khi tải
                    listenToConsole,
                    useIncognito,
                    onPageLoadedScript // Script chạy khi Loaded
            );

            if (htmlContent != null && !htmlContent.isEmpty()) {
                response.set("code", 200);
                response.set("message", "Scraping successful");
                response.set("data", htmlContent);
            } else {
                response.set("code", 500);
                response.set("message", "Failed to retrieve content from " + link);
            }
        } catch (Exception e) {
            logger.error("Error during web scraping for link {}: {}", link, e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Internal server error during scraping: " + e.getMessage());
        }
    }

    private void handleExecuteJsOnPage(StandardResponse response, Map<String, Object> params) {
        String link = (String) params.get("link");
        String script = (String) params.get("script");

        if (link == null || link.isEmpty() || script == null || script.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'link' or 'script' parameters for JavaScript execution.");
            return;
        }

        Map<String, String> proxyConfig = null;
        if (params.containsKey("proxyServer")) {
            proxyConfig = new HashMap<>();
            proxyConfig.put("server", (String) params.get("proxyServer"));
            if (params.containsKey("proxyUsername")) {
                proxyConfig.put("username", (String) params.get("proxyUsername"));
            }
            if (params.containsKey("proxyPassword")) {
                proxyConfig.put("password", (String) params.get("proxyPassword"));
            }
        }

        boolean useIncognito = Boolean.parseBoolean(String.valueOf(params.getOrDefault("useIncognito", "false")));
        String onPageLoadedScript = (String) params.get("onPageLoadedScript"); // Script chạy khi Loaded

        logger.info("Executing JS on URL: {} with script: {}", link,
                script.substring(0, Math.min(script.length(), 100)) + "...");

        try {
            // Sử dụng executeJavaScriptInternal để thực thi script và nhận kết quả
            String jsResult = webScraperService.executeJavaScriptInternal(
                    link,
                    proxyConfig,
                    script,
                    useIncognito,
                    onPageLoadedScript // Script chạy khi Loaded
            );

            if (jsResult != null) {
                response.set("code", 200);
                response.set("message", "JavaScript execution successful");
                // Chú ý: jsResult đã là JSON string nếu script của bạn trả về JSON.stringify()
                response.set("data", jsResult);
            } else {
                response.set("code", 500);
                response.set("message", "Failed to execute JavaScript on " + link);
            }
        } catch (Exception e) {
            logger.error("Error during JavaScript execution for link {}: {}", link, e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Internal server error during JavaScript execution: " + e.getMessage());
        }
    }

    // Removed: Not used in current implementation
    // private static final int GOOGLE_INDEX_API_DAILY_LIMIT = 200; // Giới hạn miễn phí của Google
    private static final int DELAY_BETWEEN_REQUESTS_MS = 500; // Delay 500ms giữa các request

    private void handleGoogleIndexing(StandardResponse response, Map<String, Object> params) {
        String operation = (String) params.getOrDefault("operation", "submit");

        switch (operation.toLowerCase()) {
            case "submit":
                handleIndexingSubmit(response, params);
                break;
            case "check":
                handleIndexingCheck(response, params);
                break;
            case "check-auto":
                handleCheckAndAutoPublish(response, params);
                break;
            case "quota":
                handleQuotaInfo(response, params);
                break;
            case "sites":
                handleSitesList(response, params);
                break;
            // ========== QUEUE OPERATIONS ==========
            case "add-to-queue":
                handleAddToQueue(response, params);
                break;
            case "add-batch-to-queue":
                handleAddBatchToQueue(response, params);
                break;
            case "queue-info":
                handleQueueInfo(response, params);
                break;
            case "queue-items":
                handleQueueItems(response, params);
                break;
            case "process-queue":
                handleProcessQueue(response, params);
                break;
            case "remove-from-queue":
                handleRemoveFromQueue(response, params);
                break;
            case "history":
                handleHistory(response, params);
                break;
            case "recent-history":
                handleRecentHistory(response, params);
                break;
            default:
                response.set("code", 400);
                response.set("message", "Invalid operation: " + operation);
                break;
        }
    }

    /**
     * Gửi URLs lên Google Indexing API
     */
    private void handleIndexingSubmit(StandardResponse response, Map<String, Object> params) {
        Object urlParam = params.get("url");
        Object urlsParam = params.get("urls");
        String action = (String) params.getOrDefault("action", "publish");

        java.util.List<String> urlList = new java.util.ArrayList<>();

        if (urlParam != null && !urlParam.toString().isEmpty()) {
            urlList.add(urlParam.toString());
        } else if (urlsParam instanceof java.util.List) {
            if (urlsParam instanceof java.util.List) {
                @SuppressWarnings("unchecked")
                java.util.List<String> urlsList = (java.util.List<String>) urlsParam;
                urlList.addAll(urlsList);
            }
        } else if (urlsParam != null) {
            urlList.add(urlsParam.toString());
        }

        if (urlList.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' or 'urls' parameter");
            return;
        }

        if (!googleIndexService.checkQuotaAvailable(urlList.size())) {
            response.set("code", 429);
            response.set("message", "Quota exceeded");
            response.set("data", googleIndexService.getQuotaInfo());
            return;
        }

        logger.info("📨 Submitting {} URLs to Google Indexing API", urlList.size());

        try {
            java.util.List<Map<String, Object>> results = new java.util.ArrayList<>();
            int successCount = 0;
            int failureCount = 0;

            for (String url : urlList) {
                GoogleIndexService.IndexingResult result = googleIndexService.submitUrlToGoogle(url, action);
                Map<String, Object> resultItem = new HashMap<>();
                resultItem.put("url", url);
                resultItem.put("success", result.success);
                resultItem.put("message", result.message);
                if (result.responseBody != null) {
                    resultItem.put("response", result.responseBody);
                }
                results.add(resultItem);

                if (result.success) {
                    successCount++;
                } else {
                    failureCount++;
                }

                // Delay để tránh rate limiting
                if (urlList.indexOf(url) < urlList.size() - 1) {
                    try {
                        Thread.sleep(DELAY_BETWEEN_REQUESTS_MS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }

            response.set("code", 200);
            response.set("success", successCount > 0);

            Map<String, Object> summary = new HashMap<>();
            summary.put("total_submitted", urlList.size());
            summary.put("success_count", successCount);
            summary.put("failure_count", failureCount);
            summary.put("quota", googleIndexService.getQuotaInfo());
            summary.put("results", results);

            response.set("data", summary);
            response.set("message", successCount + " URLs submitted successfully");

        } catch (Exception e) {
            logger.error("❌ Error during indexing submission: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Kiểm tra indexing status từ Google Search Console
     */
    private void handleIndexingCheck(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");
        if (url == null || url.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' parameter");
            return;
        }

        try {
            GoogleIndexService.SearchConsoleResult result = googleIndexService.checkIndexingStatus(url);

            Map<String, Object> data = new HashMap<>();
            data.put("url", url);
            data.put("indexed", result.isIndexed);
            data.put("verdict", result.verdict);
            if (result.details != null) {
                data.put("details", result.details);
            }

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Indexing status: " + result.verdict);

        } catch (Exception e) {
            logger.error("❌ Error checking indexing status: {}", e.getMessage());
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Kiểm tra indexing status và tự động publish nếu NEUTRAL
     */
    private void handleCheckAndAutoPublish(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");
        if (url == null || url.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' parameter");
            return;
        }

        try {
            Map<String, Object> result = googleIndexService.checkIndexingStatusAndAutoPublish(url);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", result);
            response.set("message", (String) result.get("message"));

        } catch (Exception e) {
            logger.error("❌ Error checking and auto-publishing: {}", e.getMessage());
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy thông tin quota
     */
    private void handleQuotaInfo(StandardResponse response, Map<String, Object> params) {
        try {
            Map<String, Object> quotaInfo = googleIndexService.getQuotaInfo();
            response.set("code", 200);
            response.set("success", true);
            response.set("data", quotaInfo);
            response.set("message", "Quota information retrieved");
        } catch (Exception e) {
            logger.error("❌ Error getting quota info: {}", e.getMessage());
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy danh sách sites từ Google Search Console
     */
    private void handleSitesList(StandardResponse response, Map<String, Object> params) {
        try {
            java.util.List<Map<String, Object>> sites = googleIndexService.getSiteList();
            response.set("code", 200);
            response.set("success", true);
            response.set("data", sites);
            response.set("message", "Retrieved " + sites.size() + " sites");
        } catch (Exception e) {
            logger.error("❌ Error getting sites list: {}", e.getMessage());
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    // ========== Deprecated: Removed old Google Index methods ==========
    // handleGoogleIndexRequest() - replaced by
    // GoogleIndexService.submitUrlToGoogle()
    // sendToGoogleIndexingApi() - replaced by internal sendIndexingRequest()
    // These are now handled by GoogleIndexService with proper retry logic and quota
    // management

    // ========== QUEUE MANAGEMENT OPERATIONS ==========

    /**
     * Thêm URL vào queue
     * POST /api/indexgoogle với body: {"operation": "add-to-queue", "url": "...",
     * "action": "publish", "priority": 5}
     */
    private void handleAddToQueue(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");
        String action = (String) params.getOrDefault("action", "publish");
        int priority = params.containsKey("priority")
                ? ((Number) params.get("priority")).intValue()
                : 5;

        if (url == null || url.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' parameter");
            return;
        }

        try {
            boolean added = googleIndexService.addToQueue(url, action, priority);

            Map<String, Object> data = new HashMap<>();
            data.put("url", url);
            data.put("added", added);
            data.put("message", added ? "Added to queue" : "Already in queue or recently submitted");
            data.put("queue_info", googleIndexQueueService.getQueueInfo());

            response.set("code", 200);
            response.set("success", added);
            response.set("data", data);
            response.set("message", data.get("message"));

        } catch (Exception e) {
            logger.error("❌ Error adding to queue: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Thêm nhiều URLs vào queue
     * POST /api/indexgoogle với body: {"operation": "add-batch-to-queue", "urls":
     * [...], "action": "publish", "priority": 5}
     */
    private void handleAddBatchToQueue(StandardResponse response, Map<String, Object> params) {
        Object urlsParam = params.get("urls");
        String action = (String) params.getOrDefault("action", "publish");
        int priority = params.containsKey("priority")
                ? ((Number) params.get("priority")).intValue()
                : 5;

        if (urlsParam == null) {
            response.set("code", 400);
            response.set("message", "Missing 'urls' parameter");
            return;
        }

        try {
            @SuppressWarnings("unchecked")
            java.util.List<String> urls = (java.util.List<String>) urlsParam;

            if (urls.isEmpty()) {
                response.set("code", 400);
                response.set("message", "URLs list is empty");
                return;
            }

            Map<String, Boolean> results = googleIndexService.addBatchToQueue(urls, action, priority);

            long addedCount = results.values().stream().filter(v -> v).count();
            long skippedCount = results.values().stream().filter(v -> !v).count();

            Map<String, Object> data = new HashMap<>();
            data.put("total", urls.size());
            data.put("added", addedCount);
            data.put("skipped", skippedCount);
            data.put("results", results);
            data.put("queue_info", googleIndexQueueService.getQueueInfo());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", String.format("Added %d/%d URLs to queue", addedCount, urls.size()));

        } catch (Exception e) {
            logger.error("❌ Error adding batch to queue: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy thông tin queue
     * POST /api/indexgoogle với body: {"operation": "queue-info"}
     */
    private void handleQueueInfo(StandardResponse response, Map<String, Object> params) {
        try {
            Map<String, Object> queueInfo = googleIndexQueueService.getQueueInfo();
            Map<String, Object> quotaInfo = googleIndexService.getQuotaInfo();

            Map<String, Object> data = new HashMap<>();
            data.put("queue", queueInfo);
            data.put("quota", quotaInfo);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Queue info retrieved");

        } catch (Exception e) {
            logger.error("❌ Error getting queue info: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy danh sách queue items
     * POST /api/indexgoogle với body: {"operation": "queue-items", "page": 0,
     * "pageSize": 20}
     */
    private void handleQueueItems(StandardResponse response, Map<String, Object> params) {
        int page = params.containsKey("page")
                ? ((Number) params.get("page")).intValue()
                : 0;
        int pageSize = params.containsKey("pageSize")
                ? ((Number) params.get("pageSize")).intValue()
                : 20;

        try {
            java.util.List<UrlSubmissionQueue> items = googleIndexQueueService.getQueueItems(page, pageSize);

            Map<String, Object> data = new HashMap<>();
            data.put("items", items);
            data.put("page", page);
            data.put("pageSize", pageSize);
            data.put("totalInQueue", googleIndexQueueService.getQueueInfo().get("total"));

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + items.size() + " queue items");

        } catch (Exception e) {
            logger.error("❌ Error getting queue items: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Trigger xử lý queue thủ công
     * POST /api/indexgoogle với body: {"operation": "process-queue", "batchSize":
     * 10}
     */
    private void handleProcessQueue(StandardResponse response, Map<String, Object> params) {
        int batchSize = params.containsKey("batchSize")
                ? ((Number) params.get("batchSize")).intValue()
                : 10;

        try {
            Map<String, Object> result = googleIndexService.processBatchFromQueue(batchSize);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", result);
            response.set("message", "Queue processing completed");

        } catch (Exception e) {
            logger.error("❌ Error processing queue: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Xóa URL khỏi queue
     * POST /api/indexgoogle với body: {"operation": "remove-from-queue", "url":
     * "..."}
     */
    private void handleRemoveFromQueue(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");

        if (url == null || url.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' parameter");
            return;
        }

        try {
            boolean removed = googleIndexQueueService.removeFromQueue(url);

            Map<String, Object> data = new HashMap<>();
            data.put("url", url);
            data.put("removed", removed);

            response.set("code", 200);
            response.set("success", removed);
            response.set("data", data);
            response.set("message", removed ? "Removed from queue" : "URL not found in queue");

        } catch (Exception e) {
            logger.error("❌ Error removing from queue: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy lịch sử của URL
     * POST /api/indexgoogle với body: {"operation": "history", "url": "..."}
     */
    private void handleHistory(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");

        if (url == null || url.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' parameter");
            return;
        }

        try {
            java.util.List<UrlSubmissionHistory> history = googleIndexQueueService.getHistory(url);

            Map<String, Object> data = new HashMap<>();
            data.put("url", url);
            data.put("history", history);
            data.put("count", history.size());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + history.size() + " history entries");

        } catch (Exception e) {
            logger.error("❌ Error getting history: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy lịch sử gần đây
     * POST /api/indexgoogle với body: {"operation": "recent-history", "limit": 50}
     */
    private void handleRecentHistory(StandardResponse response, Map<String, Object> params) {
        int limit = params.containsKey("limit")
                ? ((Number) params.get("limit")).intValue()
                : 50;

        try {
            java.util.List<UrlSubmissionHistory> history = googleIndexQueueService.getRecentHistory(limit);

            Map<String, Object> data = new HashMap<>();
            data.put("history", history);
            data.put("count", history.size());
            data.put("limit", limit);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + history.size() + " recent history entries");

        } catch (Exception e) {
            logger.error("❌ Error getting recent history: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy lịch sử chat theo room
     */
    private void handleChatHistory(StandardResponse response, Map<String, Object> params) {
        // Check authentication first
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        if (authentication == null || !authentication.isAuthenticated() || 
            authentication.getPrincipal() == null || "anonymousUser".equals(authentication.getPrincipal())) {
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        String room = (String) params.get("room");
        String appId = resolveAppIdParam(params);
        int limit = 50;
        
        // Handle limit parameter - convert to int, handle both Number and String types
        Object limitObj = params.get("limit");
        if (limitObj != null) {
            try {
                if (limitObj instanceof Number) {
                    limit = ((Number) limitObj).intValue();
                } else if (limitObj instanceof String) {
                    limit = Integer.parseInt((String) limitObj);
                }
            } catch (NumberFormatException e) {
                logger.warn("Invalid limit parameter: {} - using default: 50", limitObj);
            }
        }

        if (room == null || room.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'room' parameter");
            return;
        }

        if (appId == null || appId.isEmpty()) {
            appId = inferAppIdFromRoom(room);
        }

        try {
            java.util.List<net.phanmemmottrieu.model.ChatMessage> history = chatPersistenceService.getHistory(appId,
                    room, limit);

            // Normalize room field: if room="csm" (legacy data), replace with appId for consistency
            for (net.phanmemmottrieu.model.ChatMessage msg : history) {
                if (msg.getRoom() != null && msg.getRoom().equals("csm")) {
                    msg.setRoom(appId);
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("room", room);
            data.put("appId", appId);
            data.put("messages", history);
            data.put("count", history.size());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + history.size() + " messages");

        } catch (Exception e) {
            logger.error("❌ Error getting chat history: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    private String inferAppIdFromRoom(String room) {
        if (room == null || room.isEmpty()) {
            return "csm";
        }
        String normalized = room.trim();
        int colonIdx = normalized.indexOf(':');
        if (colonIdx >= 0 && colonIdx < normalized.length() - 1) {
            normalized = normalized.substring(colonIdx + 1);
        }
        int semicolonIdx = normalized.indexOf(';');
        if (semicolonIdx > 0) {
            normalized = normalized.substring(0, semicolonIdx);
        }
        if (normalized.isEmpty() || isPhoneLikeValue(normalized)) {
            return "csm";
        }
        return normalized;
    }

    private String resolveAppIdParam(Map<String, Object> params) {
        Object appIdRaw = params.get("appId");
        if (appIdRaw == null) {
            appIdRaw = params.get("app_id");
        }
        if (appIdRaw == null) {
            return null;
        }
        String appId = String.valueOf(appIdRaw).trim();
        if (appId.isEmpty() || isPhoneLikeValue(appId)) {
            return null;
        }
        return appId;
    }

    private boolean isPhoneLikeValue(String value) {
        return value != null && value.matches("^\\+?\\d[\\d\\s-]{7,}$");
    }

    /**
     * Lấy lịch sử chat theo appId và guest identity.
     */
    private void handleChatHistoryGuest(StandardResponse response, Map<String, Object> params) {
        String appId = resolveAppIdParam(params);
        String guestPhone = params.get("guestPhone") instanceof String ? ((String) params.get("guestPhone")).trim() : null;
        String guestSessionId = params.get("guestSessionId") instanceof String ? ((String) params.get("guestSessionId")).trim() : null;
        int limit = params.containsKey("limit") ? ((Number) params.get("limit")).intValue() : 50;

        if (appId == null || appId.isEmpty() || ((guestPhone == null || guestPhone.isEmpty()) && (guestSessionId == null || guestSessionId.isEmpty()))) {
            response.set("code", 400);
            response.set("message", "Missing 'appId' and guest identity parameter");
            return;
        }

        try {
            java.util.List<net.phanmemmottrieu.model.ChatMessage> history = chatPersistenceService
                    .getHistoryByGuestIdentity(appId, guestSessionId, guestPhone, limit);

            // Normalize room field: if room="csm" (legacy data), replace with appId for consistency
            for (net.phanmemmottrieu.model.ChatMessage msg : history) {
                if (msg.getRoom() != null && msg.getRoom().equals("csm")) {
                    msg.setRoom(appId);
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("appId", appId);
            data.put("guestPhone", guestPhone);
            data.put("messages", history);
            data.put("count", history.size());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + history.size() + " messages");

        } catch (Exception e) {
            logger.error("❌ Error getting guest chat history: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy lịch sử chat theo appId (cho admin)
     */
    private void handleChatHistoryApp(StandardResponse response, Map<String, Object> params) {
        // Check authentication first
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        if (authentication == null || !authentication.isAuthenticated() || 
            authentication.getPrincipal() == null || "anonymousUser".equals(authentication.getPrincipal())) {
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        String appId = resolveAppIdParam(params);
        int limit = params.containsKey("limit") ? ((Number) params.get("limit")).intValue() : 200;

        if (appId == null || appId.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'appId' parameter");
            return;
        }

        try {
            java.util.List<net.phanmemmottrieu.model.ChatMessage> history = chatPersistenceService
                    .getHistoryByAppId(appId, limit);

            // Normalize room field: if room="csm" (legacy data), replace with appId for consistency
            for (net.phanmemmottrieu.model.ChatMessage msg : history) {
                if (msg.getRoom() != null && msg.getRoom().equals("csm")) {
                    msg.setRoom(appId);
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("appId", appId);
            data.put("messages", history);
            data.put("count", history.size());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + history.size() + " messages");

        } catch (Exception e) {
            logger.error("❌ Error getting app chat history: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy danh sách tất cả apps từ sys_apps (cho CSM admin broadcast)
     */
    private void handleGetAppsList(StandardResponse response, Map<String, Object> params) {
        try {
            // Query sys_apps table to get list of all apps
            Map<String, Object> result = recordManager.filterWithPagination(
                "csm", // sys_apps is in csm database
                "sys_apps",
                null, // no filter - get all
                1000, // limit
                null  // no pagination token
            );
            
            @SuppressWarnings("unchecked")
            java.util.List<Map<String, Object>> rows = 
                (java.util.List<Map<String, Object>>) result.get("rows");
            
            // Transform to simple list of {id, name, description}
            java.util.List<Map<String, Object>> apps = new java.util.ArrayList<>();
            if (rows != null) {
                for (Map<String, Object> row : rows) {
                    Map<String, Object> app = new HashMap<>();
                    app.put("id", row.get("id"));
                    app.put("name", row.get("name"));
                    app.put("description", row.get("description"));
                    apps.add(app);
                }
            }
            
            response.set("code", 200);
            response.set("success", true);
            response.set("data", apps);
            response.set("message", "Retrieved " + apps.size() + " apps");
            
        } catch (Exception e) {
            logger.error("❌ Error getting apps list: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy danh sách guest phones đã chat trong appId
     */
    private void handleChatGuestsList(StandardResponse response, Map<String, Object> params) {
        // Check authentication (optional - allow both authenticated and unauthenticated access)
        // This endpoint can be accessed by both admin (with auth) and system (without auth)
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        boolean isAuthenticated = authentication != null && authentication.isAuthenticated() && 
            authentication.getPrincipal() != null && !"anonymousUser".equals(authentication.getPrincipal());
        
        // Log authentication status for debugging
        logger.info("[CHAT-GUESTS-LIST] Authentication status: {}", isAuthenticated ? "authenticated" : "anonymous");

        String appId = resolveAppIdParam(params);

        if (appId == null || appId.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'appId' parameter");
            return;
        }

        try {
            java.util.List<String> guestSessions = chatPersistenceService.getGuestSessionsByAppId(appId);
            java.util.List<String> guestPhones = chatPersistenceService.getGuestPhonesByAppId(appId);

            Map<String, Object> data = new HashMap<>();
            data.put("appId", appId);
            data.put("guests", guestSessions); // Use stable guest session ids for frontend expectation
            data.put("guestSessions", guestSessions);
            data.put("guestPhones", guestPhones); // Also include 'guestPhones' for backward compatibility
            data.put("count", guestSessions.size());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + guestSessions.size() + " guest users");

        } catch (Exception e) {
            logger.error("❌ Error getting guests list: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Đánh dấu tất cả tin nhắn trong room là đã đọc
     */
    private void handleChatMarkAllRead(StandardResponse response, Map<String, Object> params) {
        // Check authentication first
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        if (authentication == null || !authentication.isAuthenticated() || 
            authentication.getPrincipal() == null || "anonymousUser".equals(authentication.getPrincipal())) {
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        String room = (String) params.get("room");
        String userId = (String) params.get("userId");

        if (room == null || room.isEmpty() || userId == null || userId.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'room' or 'userId' parameter");
            return;
        }

        try {
            chatPersistenceService.markAllAsRead(room, userId);

            Map<String, Object> data = new HashMap<>();
            data.put("room", room);
            data.put("userId", userId);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Marked all messages as read");

            // Broadcast socket event to update all connected clients
            Map<String, Object> broadcastData = new HashMap<>();
            broadcastData.put("room", room);
            broadcastData.put("userId", userId);
            broadcastData.put("action", "markAllAsRead");
            socketIOServer.getBroadcastOperations().sendEvent("chat_read_update", broadcastData);

        } catch (Exception e) {
            logger.error("❌ Error marking messages as read: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Đánh dấu tin nhắn theo guest identity là đã đọc.
     */
    private void handleChatMarkRead(StandardResponse response, Map<String, Object> params) {
        String appId = resolveAppIdParam(params);
        String guestPhone = params.get("guestPhone") instanceof String ? ((String) params.get("guestPhone")).trim() : null;
        String guestSessionId = params.get("guestSessionId") instanceof String ? ((String) params.get("guestSessionId")).trim() : null;

        if (appId == null || appId.isEmpty() || ((guestPhone == null || guestPhone.isEmpty()) && (guestSessionId == null || guestSessionId.isEmpty()))) {
            response.set("code", 400);
            response.set("message", "Missing 'appId' and guest identity parameter");
            return;
        }

        try {
            chatPersistenceService.markAllAsReadByGuestIdentity(appId, guestSessionId, guestPhone);

            Map<String, Object> data = new HashMap<>();
            data.put("appId", appId);
            data.put("guestPhone", guestPhone);
            data.put("guestSessionId", guestSessionId);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Marked all messages as read");

        } catch (Exception e) {
            logger.error("❌ Error marking messages as read: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    // Helper method to get client IP (handle proxy headers)
    private String getClientIp(HttpServletRequest request, Map<String, String> lowerCaseHeaders) {
        // Check for X-Forwarded-For header (from proxy/load balancer)
        String xff = lowerCaseHeaders.get("x-forwarded-for");
        if (xff != null && !xff.isEmpty()) {
            // X-Forwarded-For can contain multiple IPs, take the first one
            String[] ips = xff.split(",");
            return ips[0].trim();
        }

        // Check for X-Real-IP header (from nginx)
        String xRealIp = lowerCaseHeaders.get("x-real-ip");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp.trim();
        }

        // Fallback to remote address
        return request.getRemoteAddr();
    }

    // Phương thức trợ giúp để xây dựng ResponseEntity từ StandardResponse cho API
    private ResponseEntity<?> buildResponseEntity(StandardResponse response) {
        try {
            if (response.hasBinaryBody()) {
                String contentType = response.getContentType();
                if (contentType == null || contentType.isEmpty()) {
                    contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
                }
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.parseMediaType(contentType));
                headers.add("X-Accel-Buffering", "no");
                headers.add("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate, no-transform");
                return ResponseEntity.status(HttpStatus.OK)
                        .headers(headers)
                        .body(response.getBinaryBody());
            } else {
                // Serialize directly to bytes to reduce GC/memory overhead for very large payloads.
                byte[] payload = objectMapper.writeValueAsBytes(response.getPropertiesMap());
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.add("X-Accel-Buffering", "no");
                headers.add("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate, no-transform");
                return ResponseEntity.status(HttpStatus.OK)
                        .headers(headers)
                        .body(payload);
            }
        } catch (Exception e) {
            logger.error("❌ Lỗi khi xây dựng phản hồi API: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("Internal server error during response construction.");
        }
    }

    /**
     * Xoá tin nhắn theo timestamp
     * CHỈ cho phép CSM admin xóa broadcast notifications
     */
    private void handleChatDeleteMessage(StandardResponse response, Map<String, Object> params) {
        // Check authentication and authorization
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        if (authentication == null || !authentication.isAuthenticated() || 
            authentication.getPrincipal() == null || "anonymousUser".equals(authentication.getPrincipal())) {
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        // Extract user info from authentication
        Object principal = authentication.getPrincipal();
        String userAppId = null;
        boolean isDev = false;
        java.util.List<String> roles = new java.util.ArrayList<>();
        
        if (principal instanceof net.phanmemmottrieu.model.User) {
            net.phanmemmottrieu.model.User user = (net.phanmemmottrieu.model.User) principal;
            userAppId = user.getAppId();
            isDev = user.getDev() != null && user.getDev();
            if (user.getPermissions() != null) {
                roles = user.getPermissions();
            }
        } else if (principal instanceof java.util.Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> userMap = (Map<String, Object>) principal;
            userAppId = (String) userMap.get("app_id");
            Object devObj = userMap.get("dev");
            isDev = devObj instanceof Boolean && (Boolean) devObj;
            Object rolesObj = userMap.get("roles");
            if (rolesObj instanceof java.util.List) {
                @SuppressWarnings("unchecked")
                java.util.List<String> rolesList = (java.util.List<String>) rolesObj;
                roles = rolesList;
            }
        }
        
        Long timestamp = null;
        if (params.get("timestamp") instanceof Number) {
            timestamp = ((Number) params.get("timestamp")).longValue();
        }
        String appId = (String) params.get("appId");

        if (timestamp == null || timestamp <= 0) {
            response.set("code", 400);
            response.set("message", "Missing or invalid 'timestamp' parameter");
            return;
        }

        if (appId == null || appId.isEmpty()) {
            appId = "csm";
        }

        try {
            // 🔥 Get message info first to check if it's a broadcast notification
            net.phanmemmottrieu.model.ChatMessage messageToDelete = chatPersistenceService.getMessageByTimestamp(appId, timestamp);
            
            if (messageToDelete == null) {
                response.set("code", 404);
                response.set("message", "Message not found");
                response.set("success", false);
                return;
            }
            
            // Check authorization based on message type
            boolean isBroadcastNotification = messageToDelete.getEventType() != null && 
                                             messageToDelete.getEventType().equals("broadcast_notification");
            boolean isCSMAdmin = "csm".equalsIgnoreCase(userAppId) && (isDev || roles.contains("admin"));
            boolean isAppAdmin = userAppId != null && userAppId.equals(appId) && (isDev || roles.contains("admin"));
            
            // Rule:
            // - Broadcast notifications (từ CSM): Chỉ CSM admin xoá được
            // - Regular messages: Admin của appId đó xoá được
            if (isBroadcastNotification) {
                // 🚫 Broadcast notification - Only CSM admin can delete
                if (!isCSMAdmin) {
                    response.set("code", 403);
                    response.set("message", "Only CSM admins can delete system broadcast notifications");
                    response.set("success", false);
                    logger.warn("⚠️ Unauthorized delete attempt for broadcast notification: userAppId={}, isDev={}, roles={}", userAppId, isDev, roles);
                    return;
                }
            } else {
                // ✅ Regular message - App admin can delete
                if (!isAppAdmin) {
                    response.set("code", 403);
                    response.set("message", "Only admins of this app can delete messages");
                    response.set("success", false);
                    logger.warn("⚠️ Unauthorized delete attempt for regular message: userAppId={}, appId={}, isDev={}, roles={}", userAppId, appId, isDev, roles);
                    return;
                }
            }

            logger.info("🗑️ User {} deleting message: appId={}, timestamp={}, isBroadcast={}", 
                       userAppId, appId, timestamp, isBroadcastNotification);
            
            boolean deleted = chatPersistenceService.deleteMessage(appId, timestamp);

            if (deleted) {
                Map<String, Object> data = new HashMap<>();
                data.put("timestamp", timestamp);
                data.put("appId", appId);

                response.set("code", 200);
                response.set("success", true);
                response.set("data", data);
                response.set("message", "Message deleted successfully");

                // Broadcast socket event to update all connected clients with app scoping
                Map<String, Object> broadcastData = new HashMap<>();
                broadcastData.put("timestamp", timestamp);
                broadcastData.put("appId", appId);
                broadcastData.put("action", "messageDeleted");
                socketIOServer.getBroadcastOperations().sendEvent("chat_message_deleted", broadcastData);
            } else {
                response.set("code", 404);
                response.set("success", false);
                response.set("message", "Message not found");
            }

        } catch (Exception e) {
            logger.error("❌ Error deleting message: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Handle Facebook API POST proxy
     * POST /api/facebook/post
     * Body: { pageId, pageAccessToken, message, imageUrl (optional), link (optional) }
     */
    private void handleFacebookPost(StandardResponse response, Map<String, Object> params) {
        try {
            String pageId = (String) params.get("pageId");
            String pageAccessToken = (String) params.get("pageAccessToken");
            String message = (String) params.get("message");
            String imageUrl = (String) params.get("imageUrl");
            String link = (String) params.get("link");

            if (pageId == null || pageId.isEmpty() || pageAccessToken == null || pageAccessToken.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing pageId or pageAccessToken");
                return;
            }

            if (message == null || message.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing message");
                return;
            }

            // Build Facebook Graph API URL
            String fbUrl;
            Map<String, String> payload = new HashMap<>();
            payload.put("access_token", pageAccessToken);

            if (imageUrl != null && !imageUrl.isEmpty()) {
                fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/photos";
                payload.put("url", imageUrl);
                payload.put("caption", message);
            } else {
                fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/feed";
                payload.put("message", message);
            }

            if (link != null && !link.isEmpty()) {
                payload.put("link", link);
            }

            // Call Facebook API using RestTemplate
            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);

            org.springframework.http.HttpEntity<Map<String, String>> entity = new org.springframework.http.HttpEntity<>(payload, headers);

            @SuppressWarnings({"unchecked", "rawtypes"})
            ResponseEntity<Map<String, Object>> facebookResponse = (ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);

            if (facebookResponse.getStatusCode().is2xxSuccessful()) {
                Map<String, Object> responseBody = facebookResponse.getBody();
                String postId = (String) responseBody.get("id");

                response.set("code", 200);
                response.set("success", true);
                response.set("message", "Post published successfully");
                response.set("data", new HashMap<String, Object>() {{
                    put("post_id", postId);
                    put("pageId", pageId);
                }});
            } else {
                response.set("code", facebookResponse.getStatusCode().value());
                response.set("success", false);
                response.set("message", "Facebook API error: " + facebookResponse.getBody());
            }

        } catch (Exception e) {
            logger.error("❌ Error posting to Facebook: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("success", false);
            response.set("message", "Error: " + e.getMessage());
        }
    }

    /**
     * Handle Facebook API POST proxy with multiple images
     * POST /api/facebook/post-with-images
     * Body: { pageId, pageAccessToken, message, images: [], videos: [], link (optional) }
     */
    private void handleFacebookPostWithImages(StandardResponse response, Map<String, Object> params) {
        try {
            String pageId = (String) params.get("pageId");
            String pageAccessToken = (String) params.get("pageAccessToken");
            String message = (String) params.get("message");
            String link = (String) params.get("link");
            Object imagesObj = params.get("images");
            Object videosObj = params.get("videos");

            if (pageId == null || pageId.isEmpty() || pageAccessToken == null || pageAccessToken.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing pageId or pageAccessToken");
                return;
            }

            if (message == null || message.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing message");
                return;
            }

            java.util.List<String> images = new java.util.ArrayList<>();
            if (imagesObj instanceof java.util.List<?>) {
                for (Object imageObj : (java.util.List<?>) imagesObj) {
                    if (imageObj instanceof String) {
                        images.add((String) imageObj);
                    }
                }
            } else if (imagesObj instanceof String && !((String) imagesObj).isBlank()) {
                images.add((String) imagesObj);
            }

            java.util.List<String> videos = new java.util.ArrayList<>();
            if (videosObj instanceof java.util.List<?>) {
                for (Object videoObj : (java.util.List<?>) videosObj) {
                    if (videoObj instanceof String) {
                        videos.add((String) videoObj);
                    }
                }
            } else if (videosObj instanceof String && !((String) videosObj).isBlank()) {
                videos.add((String) videosObj);
            }

            // Chấp nhận cả URLs và base64
            java.util.List<String> sanitizedImages = new java.util.ArrayList<>();
            for (String image : images) {
                if (image == null) continue;
                String normalized = image.trim();
                if (normalized.isEmpty()) continue;
                // Chấp nhận: http://, https://, hoặc data:image/...
                boolean isUrl = normalized.startsWith("http://") || normalized.startsWith("https://");
                boolean isBase64 = normalized.startsWith("data:image/");
                if (!(isUrl || isBase64)) continue;
                if (!sanitizedImages.contains(normalized)) {
                    sanitizedImages.add(normalized);
                }
            }

            // Chấp nhận video URLs và base64 video
            java.util.List<String> sanitizedVideos = new java.util.ArrayList<>();
            for (String video : videos) {
                if (video == null) continue;
                String normalized = video.trim();
                if (normalized.isEmpty()) continue;
                boolean isUrl = normalized.startsWith("http://") || normalized.startsWith("https://");
                boolean isBase64 = normalized.startsWith("data:video/");
                boolean isRelativeLocal = normalized.startsWith("/app_images/") || normalized.startsWith("app_images/");
                if (!(isUrl || isBase64 || isRelativeLocal)) continue;
                if (!sanitizedVideos.contains(normalized)) {
                    sanitizedVideos.add(normalized);
                }
            }

            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            final int[] imagesPosted = {0};
            final int[] videosPosted = {0};
            String videoFailureReason = null;
            String mainPostId = null;
            java.util.List<String> extraPostIds = new java.util.ArrayList<>();

            // Đăng từng video riêng biệt (Facebook không hỗ trợ mixed ảnh+video trong cùng post; mỗi video = 1 post)
            if (!sanitizedVideos.isEmpty()) {
                for (String videoInput : sanitizedVideos) {
                    String videoPostId = null;
                    try {
                        String videoUploadUrl = "https://graph.facebook.com/v18.0/" + pageId + "/videos";
                        String videoDescription = message;
                        if (link != null && !link.isEmpty() && (videoDescription == null || !videoDescription.contains(link))) {
                            videoDescription = (videoDescription == null ? "" : videoDescription) + "\n\n" + link;
                        }

                        if (videoInput.startsWith("data:video/")) {
                            int commaIndex = videoInput.indexOf(',');
                            if (commaIndex > 0) {
                                String base64Data = videoInput.substring(commaIndex + 1);
                                byte[] videoBytes = java.util.Base64.getDecoder().decode(base64Data);

                                org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                                headers.setContentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA);

                                org.springframework.util.LinkedMultiValueMap<String, Object> form = new org.springframework.util.LinkedMultiValueMap<>();
                                final byte[] finalVideoBytes = videoBytes;
                                org.springframework.core.io.ByteArrayResource videoResource = new org.springframework.core.io.ByteArrayResource(finalVideoBytes) {
                                    @Override
                                    public String getFilename() {
                                        return "video.mp4";
                                    }
                                };

                                form.add("source", videoResource);
                                form.add("description", videoDescription);
                                form.add("access_token", pageAccessToken);

                                org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, Object>> entity =
                                    new org.springframework.http.HttpEntity<>(form, headers);

                                @SuppressWarnings({"unchecked", "rawtypes"})
                                ResponseEntity<Map<String, Object>> uploadResp = (ResponseEntity) restTemplate.postForEntity(videoUploadUrl, entity, Map.class);
                                if (uploadResp.getStatusCode().is2xxSuccessful()) {
                                    Map<String, Object> respBody = uploadResp.getBody();
                                    videoPostId = respBody != null ? (String) respBody.get("id") : null;
                                    if (videoPostId != null && !videoPostId.isEmpty()) {
                                        logger.info("✅ Posted video from base64, post_id: {}", videoPostId);
                                    }
                                }
                            } else {
                                if (videoFailureReason == null) videoFailureReason = "Invalid base64 video payload";
                            }
                        } else {
                            byte[] videoBytes = null;
                            String relativePath = null;

                            // Relative local path: /app_images/... or app_images/...
                            if (videoInput.startsWith("/app_images/") || videoInput.startsWith("app_images/")) {
                                relativePath = videoInput.startsWith("/") ? videoInput.substring(1) : videoInput;
                            }

                            // Absolute URL: thử parse path để đọc local disk nếu là app_images
                            if (relativePath == null && (videoInput.startsWith("http://") || videoInput.startsWith("https://"))) {
                                try {
                                    java.net.URI uri = new java.net.URI(videoInput);
                                    String path = uri.getPath();
                                    if (path != null && path.startsWith("/app_images/")) {
                                        relativePath = path.substring(1);
                                    }
                                } catch (Exception e) {
                                    logger.warn("Cannot parse video URL {}: {}", videoInput, e.getMessage());
                                }
                            }

                            // Ưu tiên đọc từ disk giống luồng ảnh
                            if (relativePath != null) {
                                try {
                                    java.io.File videoFile = recordManager.getStaticFile(relativePath);
                                    if (videoFile != null && videoFile.exists() && videoFile.isFile()) {
                                        videoBytes = java.nio.file.Files.readAllBytes(videoFile.toPath());
                                        logger.info("✅ Read video from disk: {} bytes from {}", videoBytes.length, relativePath);
                                    } else {
                                        logger.warn("⚠️ Video file not found on disk: {}", relativePath);
                                        if (videoFailureReason == null) videoFailureReason = "Video file not found on disk: " + relativePath;
                                    }
                                } catch (Exception diskError) {
                                    logger.warn("⚠️ Cannot read video from disk {}: {}", relativePath, diskError.getMessage());
                                    if (videoFailureReason == null) videoFailureReason = "Cannot read video from disk: " + diskError.getMessage();
                                }
                            }

                            // Fallback: download HTTP URL if needed
                            if ((videoBytes == null || videoBytes.length == 0)
                                    && (videoInput.startsWith("http://") || videoInput.startsWith("https://"))) {
                                try {
                                    java.net.URL url = new java.net.URL(videoInput);
                                    java.io.InputStream inputStream = url.openStream();
                                    videoBytes = inputStream.readAllBytes();
                                    inputStream.close();
                                    logger.info("✅ Downloaded video via HTTP: {} bytes", videoBytes.length);
                                } catch (Exception downloadError) {
                                    logger.warn("⚠️ Failed to download video via HTTP {}: {}", videoInput, downloadError.getMessage());
                                    if (videoFailureReason == null) videoFailureReason = "Cannot download video URL: " + downloadError.getMessage();
                                }
                            }

                            // Strategy A: upload binary multipart (ổn định hơn khi Facebook không fetch được URL)
                            if (videoBytes != null && videoBytes.length > 0) {
                                org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                                headers.setContentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA);

                                org.springframework.util.LinkedMultiValueMap<String, Object> form = new org.springframework.util.LinkedMultiValueMap<>();
                                final byte[] finalVideoBytes = videoBytes;
                                org.springframework.core.io.ByteArrayResource videoResource = new org.springframework.core.io.ByteArrayResource(finalVideoBytes) {
                                    @Override
                                    public String getFilename() {
                                        return "video.mp4";
                                    }
                                };

                                form.add("source", videoResource);
                                form.add("description", videoDescription);
                                form.add("access_token", pageAccessToken);

                                org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, Object>> entity =
                                    new org.springframework.http.HttpEntity<>(form, headers);

                                @SuppressWarnings({"unchecked", "rawtypes"})
                                ResponseEntity<Map<String, Object>> uploadResp = (ResponseEntity) restTemplate.postForEntity(videoUploadUrl, entity, Map.class);
                                if (uploadResp.getStatusCode().is2xxSuccessful()) {
                                    Map<String, Object> respBody = uploadResp.getBody();
                                    videoPostId = respBody != null ? (String) respBody.get("id") : null;
                                    if (videoPostId != null && !videoPostId.isEmpty()) {
                                        logger.info("✅ Posted video from binary upload, post_id: {}", videoPostId);
                                    }
                                }
                            }

                            // Strategy B fallback: Facebook tự fetch file_url
                            if (videoPostId == null && (videoInput.startsWith("http://") || videoInput.startsWith("https://"))) {
                                org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                                headers.setContentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED);

                                org.springframework.util.LinkedMultiValueMap<String, String> payload = new org.springframework.util.LinkedMultiValueMap<>();
                                payload.add("file_url", videoInput);
                                payload.add("description", videoDescription);
                                payload.add("access_token", pageAccessToken);

                                org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, String>> entity =
                                    new org.springframework.http.HttpEntity<>(payload, headers);

                                @SuppressWarnings({"unchecked", "rawtypes"})
                                ResponseEntity<Map<String, Object>> uploadResp = (ResponseEntity) restTemplate.postForEntity(videoUploadUrl, entity, Map.class);
                                if (uploadResp.getStatusCode().is2xxSuccessful()) {
                                    Map<String, Object> respBody = uploadResp.getBody();
                                    videoPostId = respBody != null ? (String) respBody.get("id") : null;
                                    if (videoPostId != null && !videoPostId.isEmpty()) {
                                        logger.info("✅ Posted video from URL, post_id: {}", videoPostId);
                                    } else {
                                        if (videoFailureReason == null) videoFailureReason = "Facebook did not return video id";
                                    }
                                }
                            }
                        }
                    } catch (Exception videoEx) {
                        if (videoEx instanceof org.springframework.web.client.HttpStatusCodeException httpEx) {
                            logger.warn("❌ Failed to post video {}: status={}, body={}",
                                    videoInput.length() > 60 ? videoInput.substring(0, 60) : videoInput,
                                    httpEx.getStatusCode(), httpEx.getResponseBodyAsString());
                        } else {
                            logger.warn("❌ Failed to post video {}: {}", videoInput.length() > 60 ? videoInput.substring(0, 60) : videoInput, videoEx.getMessage());
                        }
                        if (videoFailureReason == null) videoFailureReason = videoEx.getMessage();
                    }
                    // Ghi nhận post_id của video này vào mainPostId hoặc extraPostIds
                    if (videoPostId != null && !videoPostId.isEmpty()) {
                        if (mainPostId == null) {
                            mainPostId = videoPostId;
                        } else {
                            extraPostIds.add(videoPostId);
                        }
                        videosPosted[0]++;
                    }
                } // end for each video
            }

            // If caller only requested video, do not silently downgrade to text post.
            if (!sanitizedVideos.isEmpty() && sanitizedImages.isEmpty() && videosPosted[0] == 0) {
                Map<String, Object> data = new HashMap<>();
                data.put("pageId", pageId);
                data.put("videos_count", 0);
                data.put("images_count", 0);
                data.put("reason", videoFailureReason != null ? videoFailureReason : "Video upload failed");
                response.set("code", 502);
                response.set("success", false);
                response.set("message", "Video upload failed. Post was not published to avoid text-only fallback.");
                response.set("data", data);
                return;
            }

            // Nếu có images, upload từng ảnh ở chế độ unpublished rồi attach vào /feed.
            // Nếu video đã đăng trước đó, tạo thêm post ảnh riêng thay vì bỏ qua ảnh.
            if (!sanitizedImages.isEmpty()) {
                try {
                    java.util.List<String> mediaFbIds = new java.util.ArrayList<>();
                    String photoUploadUrl = "https://graph.facebook.com/v18.0/" + pageId + "/photos";

                    for (String imageUrl : sanitizedImages) {
                        if (imageUrl == null || imageUrl.isEmpty()) continue;
                        try {
                            logger.info("📤 Processing image for Facebook: {}", 
                                imageUrl.length() > 100 ? imageUrl.substring(0, 100) + "..." : imageUrl);
                            
                            byte[] imageBytes = null;
                            
                            // STRATEGY 1: Nếu là base64, decode trực tiếp
                            if (imageUrl.startsWith("data:image/")) {
                                try {
                                    // Format: data:image/png;base64,iVBORw0KGgoAAAANS...
                                    int commaIndex = imageUrl.indexOf(',');
                                    if (commaIndex > 0) {
                                        String base64Data = imageUrl.substring(commaIndex + 1);
                                        imageBytes = java.util.Base64.getDecoder().decode(base64Data);
                                        logger.info("✅ Decoded base64 image: {} bytes", imageBytes.length);
                                    } else {
                                        logger.warn("⚠️ Invalid base64 format (no comma): {}", imageUrl.substring(0, 50));
                                        continue;
                                    }
                                } catch (Exception decodeError) {
                                    logger.warn("❌ Failed to decode base64: {}", decodeError.getMessage());
                                    continue;
                                }
                            }
                            // STRATEGY 2: Nếu là URL từ server này, đọc file trực tiếp từ disk
                            else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
                                String relativePath = null;
                                
                                // Parse URL để lấy relative path (vd: app_images/wuweb/upload123.png)
                                try {
                                    java.net.URI uri = new java.net.URI(imageUrl);
                                    String path = uri.getPath();
                                    if (path != null && path.startsWith("/")) {
                                        relativePath = path.substring(1); // Bỏ "/" đầu tiên
                                    }
                                } catch (Exception e) {
                                    logger.warn("Cannot parse URL {}: {}", imageUrl, e.getMessage());
                                }
                                
                                // Thử đọc file từ disk trước (nhanh hơn và đáng tin cậy hơn)
                                if (relativePath != null && relativePath.startsWith("app_images/")) {
                                    try {
                                        java.io.File imageFile = recordManager.getStaticFile(relativePath);
                                        if (imageFile != null && imageFile.exists() && imageFile.isFile()) {
                                            imageBytes = java.nio.file.Files.readAllBytes(imageFile.toPath());
                                            logger.info("✅ Read image from disk: {} bytes from {}", imageBytes.length, relativePath);
                                        } else {
                                            logger.warn("⚠️ Image file not found on disk: {}", relativePath);
                                        }
                                    } catch (Exception diskError) {
                                        logger.warn("⚠️ Cannot read from disk {}: {}", relativePath, diskError.getMessage());
                                    }
                                }
                                
                                // STRATEGY 3: Fallback - download qua HTTP nếu không đọc được từ disk
                                if (imageBytes == null || imageBytes.length == 0) {
                                    try {
                                        java.net.URL url = new java.net.URL(imageUrl);
                                        java.io.InputStream inputStream = url.openStream();
                                        imageBytes = inputStream.readAllBytes();
                                        inputStream.close();
                                        logger.info("✅ Downloaded image via HTTP: {} bytes", imageBytes.length);
                                    } catch (Exception downloadError) {
                                        logger.warn("❌ Failed to download image from {}: {}", imageUrl, downloadError.getMessage());
                                        continue;
                                    }
                                }
                            }

                            if (imageBytes == null || imageBytes.length == 0) {
                                logger.warn("❌ Empty image data from {}", imageUrl);
                                continue;
                            }

                            // Upload binary trực tiếp lên Facebook (multipart/form-data)
                            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                            headers.setContentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA);

                            org.springframework.util.LinkedMultiValueMap<String, Object> form = new org.springframework.util.LinkedMultiValueMap<>();
                            
                            // Tạo ByteArrayResource với filename
                            final byte[] finalImageBytes = imageBytes;
                            org.springframework.core.io.ByteArrayResource imageResource = new org.springframework.core.io.ByteArrayResource(finalImageBytes) {
                                @Override
                                public String getFilename() {
                                    return "image.jpg"; // Facebook yêu cầu filename
                                }
                            };
                            
                            form.add("source", imageResource);
                            form.add("published", "false");
                            form.add("access_token", pageAccessToken);

                            org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, Object>> entity =
                                new org.springframework.http.HttpEntity<>(form, headers);

                            @SuppressWarnings({"unchecked", "rawtypes"})
                            ResponseEntity<Map<String, Object>> uploadResp = (ResponseEntity) restTemplate.postForEntity(photoUploadUrl, entity, Map.class);
                            if (uploadResp.getStatusCode().is2xxSuccessful()) {
                                Map<String, Object> respBody = uploadResp.getBody();
                                String mediaId = respBody != null ? (String) respBody.get("id") : null;
                                if (mediaId != null && !mediaId.isEmpty()) {
                                    mediaFbIds.add(mediaId);
                                    logger.info("✅ Uploaded to Facebook, media_id: {}", mediaId);
                                } else {
                                    logger.warn("⚠️ Facebook returned success but no media_id");
                                }
                            } else {
                                logger.warn("❌ Upload image failed: {}", uploadResp.getBody());
                            }
                        } catch (Exception perImageError) {
                            logger.warn("❌ Upload image failed for URL {}: {}", imageUrl, perImageError.getMessage());
                        }
                    }

                    if (!mediaFbIds.isEmpty()) {
                        String fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/feed";
                        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                        headers.setContentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED);

                        org.springframework.util.LinkedMultiValueMap<String, String> payload = new org.springframework.util.LinkedMultiValueMap<>();
                        String photoMessage = message;
                        if (mainPostId != null) {
                            photoMessage = (photoMessage == null ? "" : photoMessage) + "\n\n📷 Bộ ảnh minh họa bổ sung cho video ở trên.";
                        }
                        payload.add("message", photoMessage);
                        payload.add("access_token", pageAccessToken);

                        for (int i = 0; i < mediaFbIds.size(); i++) {
                            String mediaId = mediaFbIds.get(i);
                            payload.add("attached_media[" + i + "]", "{\"media_fbid\":\"" + mediaId + "\"}");
                        }

                        // Không gửi link cùng attached_media vì Graph API có thể từ chối hoặc bỏ ảnh.

                        org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, String>> entity =
                            new org.springframework.http.HttpEntity<>(payload, headers);

                        @SuppressWarnings({"unchecked", "rawtypes"})
                        ResponseEntity<Map<String, Object>> fbResponse = (ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);
                        if (fbResponse.getStatusCode().is2xxSuccessful()) {
                            Map<String, Object> respBody = fbResponse.getBody();
                            String photoPostId = respBody != null ? (String) respBody.get("id") : null;
                            imagesPosted[0] = mediaFbIds.size();
                            if (photoPostId != null && !photoPostId.isEmpty()) {
                                if (mainPostId == null) {
                                    mainPostId = photoPostId;
                                } else {
                                    extraPostIds.add(photoPostId);
                                }
                            }
                            logger.info("✅ Posted multi-photo album with {} images", imagesPosted[0]);
                        } else {
                            logger.warn("❌ Failed to post multi-photo album: {}", fbResponse.getBody());
                        }
                    }
                } catch (Exception e) {
                    logger.warn("❌ Error posting multi-photo album: {}. Fallback to single image", e.getMessage());
                    // Fallback: post only first image if album fails
                    mainPostId = null;
                    imagesPosted[0] = 0;
                }
            }

            // Fallback: Nếu không có images hoặc album fail, post text bình thường
            if (mainPostId == null) {
                if (!sanitizedImages.isEmpty()) {
                    // Retry with single image
                    String imageUrl = sanitizedImages.get(0);
                    if (imageUrl != null && !imageUrl.isEmpty()) {
                        String fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/photos";
                        Map<String, String> payload = new java.util.HashMap<>();
                        payload.put("url", imageUrl);
                        payload.put("caption", message);
                        payload.put("access_token", pageAccessToken);

                        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
                        org.springframework.http.HttpEntity<Map<String, String>> entity = new org.springframework.http.HttpEntity<>(payload, headers);

                        try {
                            @SuppressWarnings({"unchecked", "rawtypes"})
                            ResponseEntity<Map<String, Object>> fbResponse = (ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);
                            if (fbResponse.getStatusCode().is2xxSuccessful()) {
                                Map<String, Object> respBody = fbResponse.getBody();
                                mainPostId = (String) respBody.get("id");
                                imagesPosted[0] = 1;
                                logger.info("✅ Fallback: Posted single photo");
                            }
                        } catch (Exception e) {
                            logger.warn("❌ Failed to post single image: {}", e.getMessage());
                        }
                    }
                }

                // If still no post, post text only
                if (mainPostId == null) {
                    String fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/feed";
                    Map<String, String> payload = new java.util.HashMap<>();
                    payload.put("message", message);
                    payload.put("access_token", pageAccessToken);
                    
                    if (link != null && !link.isEmpty()) {
                        payload.put("link", link);
                    }

                    org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                    headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
                    org.springframework.http.HttpEntity<Map<String, String>> entity = new org.springframework.http.HttpEntity<>(payload, headers);

                    @SuppressWarnings({"unchecked", "rawtypes"})
                    ResponseEntity<Map<String, Object>> fbResponse = (ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);
                    if (fbResponse.getStatusCode().is2xxSuccessful()) {
                        Map<String, Object> respBody = fbResponse.getBody();
                        mainPostId = (String) respBody.get("id");
                        logger.info("✅ Posted text only");
                    } else {
                        response.set("code", fbResponse.getStatusCode().value());
                        response.set("success", false);
                        response.set("message", "Facebook API error: " + fbResponse.getBody());
                        return;
                    }
                }
            }

            if (mainPostId != null) {
                final String finalPostId = mainPostId;
                java.util.List<String> allPostIds = new java.util.ArrayList<>();
                allPostIds.add(finalPostId);
                allPostIds.addAll(extraPostIds);
                response.set("code", 200);
                response.set("success", true);
                response.set("message", "Post published successfully");
                response.set("data", new HashMap<String, Object>() {{
                    put("post_id", finalPostId);
                    put("extra_post_ids", extraPostIds);
                    put("all_post_ids", allPostIds);
                    put("pageId", pageId);
                    put("images_count", imagesPosted[0]);
                    put("videos_count", videosPosted[0]);
                }});
            } else {
                // Nếu không có ảnh, post text bình thường
                String fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/feed";
                Map<String, String> payload = new HashMap<>();
                payload.put("message", message);
                payload.put("access_token", pageAccessToken);
                if (link != null && !link.isEmpty()) {
                    payload.put("link", link);
                }

                org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
                org.springframework.http.HttpEntity<Map<String, String>> entity = new org.springframework.http.HttpEntity<>(payload, headers);

                @SuppressWarnings({"unchecked", "rawtypes"})
                ResponseEntity<Map<String, Object>> fbResponse = (ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);
                if (fbResponse.getStatusCode().is2xxSuccessful()) {
                    Map<String, Object> respBody = fbResponse.getBody();
                    String postId = (String) respBody.get("id");

                    response.set("code", 200);
                    response.set("success", true);
                    response.set("message", "Post published successfully");
                    response.set("data", new HashMap<String, Object>() {{
                        put("post_id", postId);
                        put("pageId", pageId);
                        put("images_count", 0);
                        put("videos_count", 0);
                    }});
                } else {
                    response.set("code", fbResponse.getStatusCode().value());
                    response.set("success", false);
                    response.set("message", "Facebook API error: " + fbResponse.getBody());
                }
            }

        } catch (Exception e) {
            if (e instanceof org.springframework.web.client.HttpStatusCodeException httpEx) {
                logger.error("❌ Error posting to Facebook with images: status={}, body={}",
                        httpEx.getStatusCode(), httpEx.getResponseBodyAsString(), e);
            } else {
                logger.error("❌ Error posting to Facebook with images: {}", e.getMessage(), e);
            }
            response.set("code", 500);
            response.set("success", false);
            response.set("message", "Error: " + e.getMessage());
        }
    }



    /**
     * Exchange short-lived User Token (Token A) to long-lived Token B (60 days)
     * POST /api/facebook/exchange-token
     * Body: { accessToken, clientId, appSecret }
     */
    private void handleFacebookExchangeToken(StandardResponse response, Map<String, Object> params) {
        try {
            String accessToken = (String) params.get("accessToken");
            if (accessToken == null || accessToken.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing accessToken");
                response.set("success", false);
                return;
            }

            String clientId = (String) params.get("clientId");
            if (clientId == null || clientId.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing clientId");
                response.set("success", false);
                return;
            }

            String appSecret = (String) params.get("appSecret");
            if (appSecret == null || appSecret.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing appSecret");
                response.set("success", false);
                return;
            }

            String url = String.format("https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=%s&client_secret=%s&fb_exchange_token=%s",
                    clientId, appSecret, accessToken);

            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            @SuppressWarnings("unchecked")
            Map<String, Object> fbResponse = restTemplate.getForObject(url, Map.class);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", fbResponse);
            response.set("message", "Token exchanged successfully");
        } catch (Exception e) {
            logger.error("❌ Error exchanging Facebook token: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("success", false);
            response.set("message", "Error: " + e.getMessage());
        }
    }

    /**
     * Get pages list with page tokens
     * POST /api/facebook/pages
     * Body: { accessToken }
     */
    private void handleFacebookPages(StandardResponse response, Map<String, Object> params) {
        try {
            String accessToken = (String) params.get("accessToken");
            if (accessToken == null || accessToken.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing accessToken");
                response.set("success", false);
                return;
            }

            // Request pages with necessary fields including permanent page access token
            String url = String.format(
                "https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,category,tasks&access_token=%s", 
                accessToken
            );
            
            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            @SuppressWarnings("unchecked")
            Map<String, Object> fbResponse = restTemplate.getForObject(url, Map.class);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", fbResponse);
            response.set("message", "Pages retrieved successfully");
        } catch (Exception e) {
            logger.error("❌ Error fetching Facebook pages: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("success", false);
            response.set("message", "Error: " + e.getMessage());
        }
    }

    /**
     * Validate token
     * POST /api/facebook/me
     * Body: { accessToken }
     */
    private void handleFacebookMe(StandardResponse response, Map<String, Object> params) {
        try {
            String accessToken = (String) params.get("accessToken");
            if (accessToken == null || accessToken.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing accessToken");
                response.set("success", false);
                return;
            }

            String url = String.format("https://graph.facebook.com/v18.0/me?access_token=%s", accessToken);
            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            @SuppressWarnings("unchecked")
            Map<String, Object> fbResponse = restTemplate.getForObject(url, Map.class);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", fbResponse);
            response.set("message", "Token valid");
        } catch (Exception e) {
            logger.error("❌ Error validating Facebook token: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("success", false);
            response.set("message", "Error: " + e.getMessage());
        }
    }

    /**
     * Find matching closing brace for an opening brace at given position.
     * Handles nested braces and ignores braces inside strings.
     * 
     * @param content String to search in
     * @param openBracePos Position of opening brace
     * @return Position of matching closing brace, or -1 if not found
     */
    private int findMatchingBrace(String content, int openBracePos) {
        if (openBracePos < 0 || openBracePos >= content.length() 
            || content.charAt(openBracePos) != '{') {
            return -1;
        }

        int braceCount = 1;
        boolean inString = false;
        boolean escaped = false;

        for (int i = openBracePos + 1; i < content.length(); i++) {
            char c = content.charAt(i);

            if (escaped) {
                escaped = false;
                continue;
            }

            if (c == '\\') {
                escaped = true;
                continue;
            }

            if (c == '"') {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (c == '{') {
                    braceCount++;
                } else if (c == '}') {
                    braceCount--;
                    if (braceCount == 0) {
                        logger.debug("Found matching brace at position {}", i);
                        return i;
                    }
                }
            }
        }

        logger.warn("No matching brace found for position {}", openBracePos);
        return -1;
    }

    /**
     * Escape newlines and special characters in JSON string values.
     * Handles literal newlines that should be escaped as \n in JSON.
     * 
     * @param jsonStr Raw JSON string with potential literal newlines
     * @return JSON string with escaped newlines
     */
    private String escapeNewlinesInJson(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) {
            return jsonStr;
        }

        StringBuilder result = new StringBuilder();
        boolean inString = false;
        boolean escaped = false;

        for (int i = 0; i < jsonStr.length(); i++) {
            char c = jsonStr.charAt(i);

            if (escaped) {
                result.append(c);
                escaped = false;
                continue;
            }

            if (c == '\\') {
                escaped = true;
                result.append(c);
                continue;
            }

            if (c == '"') {
                inString = !inString;
                result.append(c);
                continue;
            }

            // Inside string: escape special characters
            if (inString) {
                if (c == '\n') {
                    result.append("\\n");
                } else if (c == '\r') {
                    result.append("\\r");
                } else if (c == '\t') {
                    result.append("\\t");
                } else {
                    result.append(c);
                }
            } else {
                result.append(c);
            }
        }

        logger.debug("🔧 Escaped newlines in JSON: {} → {} chars", jsonStr.length(), result.length());
        return result.toString();
    }

    /**
     * Endpoint: AI Cost Dashboard - Real-time metrics on API calls and cost
     */
    @GetMapping({"/ai-metrics-dashboard", "/api/ai-metrics-dashboard"})
    public ResponseEntity<Map<String, Object>> getAiMetricsDashboard(
            @RequestParam(required = false) Integer windowHours,
            @RequestParam(required = false) Double fallbackRateThreshold,
            @RequestParam(required = false) Double quickProbeRateThreshold,
            @RequestParam(required = false) Integer minSamples) {
        UserAuthContext authCtx = extractUserAuthContext();
        Map<String, Object> dashboard = new HashMap<>();

        // Aggregated metrics
        Map<String, Object> metrics = apiCallInstrumentationService.getMetricsBySummary();
        dashboard.put("metrics", metrics);

        // Cost breakdown by API type
        Map<String, Object> breakdown = new HashMap<>();
        breakdown.put("gemini_total_cost_vnd", metrics.getOrDefault("totalGeminiCostVND", 0));
        breakdown.put("local_processes_saved_cost", metrics.getOrDefault("costSavingsVND", 0));
        breakdown.put("estimated_monthly_cost_vnd", metrics.getOrDefault("estimatedMonthlyCostVND", 0));
        dashboard.put("cost_breakdown", breakdown);

        // Recent API calls (last 20)
        dashboard.put("recent_calls", apiCallInstrumentationService.getMetrics());

        int effectiveWindowHours = windowHours == null
            ? Math.max(1, aiTelemetryDashboardWindowHours)
            : Math.max(1, windowHours);
        double effectiveFallbackThreshold = fallbackRateThreshold == null
            ? Math.max(0.01, aiTelemetryAlertFallbackRateThreshold)
            : Math.max(0.01, fallbackRateThreshold);
        double effectiveQuickProbeThreshold = quickProbeRateThreshold == null
            ? Math.max(0.01, aiTelemetryAlertQuickProbeRateThreshold)
            : Math.max(0.01, quickProbeRateThreshold);
        int effectiveMinSamples = minSamples == null
            ? Math.max(5, aiTelemetryAlertMinSamples)
            : Math.max(5, minSamples);

        dashboard.put(
            "ai_telemetry_dashboard",
            apiCallInstrumentationService.getAiTelemetryDashboard(
                effectiveWindowHours,
                effectiveFallbackThreshold,
                effectiveQuickProbeThreshold,
                effectiveMinSamples));

        dashboard.put("timestamp", System.currentTimeMillis());
        dashboard.put("user", authCtx.principalId);

        return ResponseEntity.ok(dashboard);
    }

    @PostMapping({"/ai-orchestration-preview", "/api/ai-orchestration-preview"})
    public ResponseEntity<Map<String, Object>> previewAiOrchestration(@RequestBody(required = false) Map<String, Object> body) {
        UserAuthContext authCtx = extractUserAuthContext();
        Map<String, Object> request = body == null ? new LinkedHashMap<>() : body;

        String appId = String.valueOf(request.getOrDefault("appId", "")).trim();
        if (appId.isBlank()) {
            appId = String.valueOf(authCtx.appId == null ? "" : authCtx.appId).trim();
        }
        if (appId.isBlank()) {
            appId = "csm";
        }

        String message = String.valueOf(request.getOrDefault("message", "")).trim();
        String currentCode = String.valueOf(request.getOrDefault("currentCode", "")).trim();
        String language = String.valueOf(request.getOrDefault("language", "javascript")).trim();
        String contextType = String.valueOf(request.getOrDefault("contextType", "code")).trim();
        String taskType = String.valueOf(request.getOrDefault("taskType", "code_assistant")).trim();
        String responseMode = normalizeAiAssistantResponseMode(request.get("responseMode"), message);
        List<Map<String, Object>> attachments = normalizeAiAssistantAttachments(request.get("attachments"));

        AiLocalOrchestrationService.OrchestrationResult result = aiLocalOrchestrationService.orchestrate(
            appId,
            message,
            currentCode,
            attachments,
            contextType,
            taskType,
            responseMode,
            language);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("appId", appId);
        out.put("contextType", contextType);
        out.put("taskType", taskType);
        out.put("responseMode", responseMode);
        out.put("orchestrationEnabled", result.enabled);
        out.put("routingTier", result.routingTier);
        out.put("preferredModelHint", result.preferredModelHint);
        out.put("speculativeExecuted", result.speculativeExecuted);
        out.put("speculativeOperation", result.speculativeOperation);
        out.put("totalCharsBefore", result.totalCharsBefore);
        out.put("totalCharsAfter", result.totalCharsAfter);
        out.put("savedChars", result.savedChars);
        out.put("planSteps", result.planSteps);
        out.put("toolStats", result.toolStats);
        out.put("compressedContextBlock", result.compressedContextBlock);
        out.put("timestamp", System.currentTimeMillis());
        out.put("user", authCtx.principalId);
        return ResponseEntity.ok(out);
    }

    /**
     * Endpoint: AI Quality Report - Validate menu output against CSM standards
     */
    @PostMapping({"/ai-quality-check", "/api/ai-quality-check"})
    public ResponseEntity<Map<String, Object>> checkMenuQuality(@RequestBody Map<String, Object> body) {
        UserAuthContext authCtx = extractUserAuthContext();
        if (!authCtx.authenticated) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
        }

        Object menuListObj = body.get("menus");
        String requirement = String.valueOf(body.getOrDefault("requirement", ""));

        if (!(menuListObj instanceof List)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid menus format"));
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> menus = (List<Map<String, Object>>) menuListObj;

        MenuQualityGateService.QualityReport report = menuQualityGateService.validateMenuJson(menus, requirement);

        Map<String, Object> response = new HashMap<>();
        response.put("quality_score", report.qualityScore);
        response.put("passes_hard_gate", report.passesHardGate);
        response.put("summary", report.summary);
        response.put("stats", report.stats);
        response.put("errors", report.getErrors());
        response.put("warnings", report.getWarnings());

        // Record this quality check
        apiCallInstrumentationService.recordQualityCheck(
            "menu_quality_gate",
            menus.size(),
            report.qualityScore,
            report.passesHardGate
        );

        return ResponseEntity.ok(response);
    }

    /**
     * Endpoint: Token Optimization - Calculate compression savings
     */
    @PostMapping({"/ai-token-optimize", "/api/ai-token-optimize"})
    public ResponseEntity<Map<String, Object>> optimizeTokenUsage(@RequestBody Map<String, Object> body) {
        UserAuthContext authCtx = extractUserAuthContext();
        if (!authCtx.authenticated) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
        }

        String content = String.valueOf(body.getOrDefault("content", ""));
        String hint = String.valueOf(body.getOrDefault("hint", "menu")); // "menu" or "code"

        if (content.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Empty content"));
        }

        TokenOptimizationService.OptimizationResult result = tokenOptimizationService.optimize(content, hint);

        Map<String, Object> costSavings = tokenOptimizationService.calculateCostSavings(
            result.originalChars,
            result.optimizedChars,
            0.00003 // Approximate Gemini input token cost
        );

        Map<String, Object> response = new HashMap<>();
        response.put("original_chars", result.originalChars);
        response.put("optimized_chars", result.optimizedChars);
        response.put("reduction_percent", String.format("%.1f%%", result.reductionPercent));
        response.put("optimized_content", result.optimizedContent.substring(0, Math.min(500, result.optimizedContent.length())) + "...");
        response.put("compression_stats", result.compressionStats);
        response.put("cost_savings", costSavings);

        return ResponseEntity.ok(response);
    }

    /**
     * Endpoint: Conversation Context - Get historical AI interactions for user
     */
    @GetMapping({"/ai-conversation-history", "/api/ai-conversation-history"})
    public ResponseEntity<Map<String, Object>> getConversationHistory(
            @RequestParam String appId,
            @RequestParam String contextType,
            @RequestParam(required = false, defaultValue = "user") String scope,
            @RequestParam(required = false) String pName,
            @RequestParam(required = false) Integer pType) {
        UserAuthContext authCtx = extractUserAuthContext();
        if (!authCtx.authenticated) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
        }

        String normalizedScope = String.valueOf(scope == null ? "user" : scope).trim().toLowerCase();
        AiConversationContextService.ConversationSession session;
        if ("app_shared".equals(normalizedScope)) {
            session = aiConversationContextService.getSharedAppSession(appId, contextType);
        } else if ("code_target_shared".equals(normalizedScope)) {
            session = aiConversationContextService.getSharedCodeTargetSession(appId, contextType, pName, pType);
        } else {
            session = aiConversationContextService.getSession(authCtx.principalId, appId, contextType);
            normalizedScope = "user";
        }

        if (session == null) {
            return ResponseEntity.ok(Map.of("message", "No conversation history", "turns", List.of()));
        }

        Map<String, Object> response = new HashMap<>();
        response.put("scope", normalizedScope);
        response.put("session_id", session.sessionId);
        response.put("total_turns", session.history.size());
        response.put("total_input_chars", session.totalInputChars);
        response.put("total_output_chars", session.totalOutputChars);
        List<AiConversationContextService.ConversationTurn> recentTurns = session.history.size() <= 5
            ? new ArrayList<>(session.history)
            : new ArrayList<>(session.history.subList(session.history.size() - 5, session.history.size()));
        response.put("summary", String.format(
            "Session=%s scope=%s turns=%d input=%d output=%d",
            session.sessionId,
            normalizedScope,
            session.history.size(),
            session.totalInputChars,
            session.totalOutputChars));
        response.put("recent_turns", recentTurns);
        response.put("aggregated_context_preview", aiConversationContextService.buildAggregatedContextWindow(
            authCtx.principalId,
            appId,
            contextType,
            pName,
            pType));

        return ResponseEntity.ok(response);
    }
}