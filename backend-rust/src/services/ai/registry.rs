//! Registry of Java AI services — each entry maps to a Rust handler stub.
//! Full business logic ports incrementally from `backend/.../service/*.java`.

use serde_json::{json, Map, Value};

pub const AI_SERVICE_NAMES: &[&str] = &[
    "AiLocalOrchestrationService",
    "AiLocalRuntimeTierService",
    "LlamaCppNativeService",
    "AiAssistantGatewayService",
    "AiSeoContentPipelineService",
    "AiGuestWebChatService",
    "AiLocalLlamaVisionNativeService",
    "AiLocalEmbeddingService",
    "AiMultimodalScannerService",
    "AiGreenfieldBusinessDesignService",
    "AiScopedContextIngestionService",
    "AiGraphRagService",
    "LocalAiAssistantContextService",
    "AiCodeLearningMemoryService",
    "AiBusinessMemoryVectorService",
    "MenuQualityGateService",
    "AiCharacterProfileService",
    "AiEditTaskPlannerService",
    "BundledFfmpegService",
    "AiMediaMartialCinematicRenderService",
    "AiMediaTalkingPresenterRenderService",
    "AiLocalTalkingHeadService",
    "AiLocalPiperTtsService",
    "AiMediaCharacterDirectorRenderService",
    "AiMediaStoryboardPlannerService",
    "AiCharacterExtractService",
    "BundledRembgService",
    "AiMediaTemplateProRenderService",
    "AiMediaScriptRenderService",
    "AiAgentHarnessTraceService",
    "AiTenantKnowledgeIngestionService",
    "AiExecutionPlannerService",
    "LocalTranslationService",
    "AiIncrementalStepExecutorService",
    "ComfyUIProcessService",
    "ApiCallInstrumentationService",
    "LargeFileChunkingService",
    "AiPatternCacheService",
    "AiMenuLearningMemoryService",
    "AiLocalWorkflowAdvisorService",
    "AiIntentClassifierService",
    "AiConversationContextService",
    "AiAssistantMemoryManagerService",
    "AiAgenticWebSearchService",
    "AiPromptBudgetService",
    "AiSpeculativeExecutionService",
    "AiMenuMergeService",
    "TokenOptimizationService",
];

pub fn dispatch(service: &str, params: &Map<String, Value>) -> Value {
    crate::services::ai::services::AiServices::invoke(service, params)
}

pub fn list_services() -> Value {
    json!({
        "count": AI_SERVICE_NAMES.len(),
        "services": AI_SERVICE_NAMES,
        "backend": "rust"
    })
}
