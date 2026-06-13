package services

import (
	"os"
	"path/filepath"
	"strings"

	"csm_server/backend-go/internal/config"
)

var aiServiceNames = []string{
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
}

func ListAIServices() map[string]any {
	return map[string]any{
		"count":    len(aiServiceNames),
		"services": aiServiceNames,
		"backend":  "go",
	}
}

type AiLocalOpsService struct {
	cfg config.AppConfig
}

func NewAiLocalOpsService(cfg config.AppConfig) *AiLocalOpsService {
	return &AiLocalOpsService{cfg: cfg}
}

func llamaProviderLabel(llama *LlamaService) string {
	if llama != nil && llama.UsesNative() {
		return "llama.cpp-native"
	}
	if llama != nil && llama.IsAvailable() {
		return "llama.cpp-sidecar"
	}
	return "llama.cpp"
}

func (s *AiLocalOpsService) Health(llama *LlamaService) map[string]any {
	modelPath := s.cfg.AI.LlamaModelPath
	modelOnDisk := llama != nil && llama.ModelOnDisk()
	nativeReady := llama != nil && llama.UsesNative()
	sidecarOK := llama != nil && llama.SidecarReachable()
	inferenceReady := llama != nil && llama.IsAvailable()
	status := map[string]any{}
	if llama != nil {
		status = llama.StatusSummary()
	}
	return map[string]any{
		"success": true,
		"policy": map[string]any{
			"localOnlyEnabled":      true,
			"multimodalLocalOnly":   true,
			"multimodalRequireVision": false,
		},
		"reasoning": map[string]any{
			"provider":             llamaProviderLabel(llama),
			"beanPresent":          modelOnDisk,
			"modelOnDisk":          modelOnDisk,
			"nativeEnabled":        s.cfg.AI.LlamaNativeEnabled,
			"nativeReady":          nativeReady,
			"sidecarReachable":     sidecarOK,
			"sidecarURL":           s.cfg.AI.LlamaServerURL,
			"available":            inferenceReady,
			"healthy":              inferenceReady,
			"hint":                 status["hint"],
			"circuitOpen":          false,
			"modelPath":            modelPath,
			"runtimeProfile":         envOr("AI_LOCAL_LLAMA_RUNTIME_PROFILE", "balanced"),
			"contextWindow":        s.cfg.EffectiveLlamaContextWindow(),
			"maxTokens":            s.cfg.EffectiveLlamaMaxTokens(),
			"batchSize":            s.cfg.AI.LlamaBatchSize,
			"ubatchSize":           s.cfg.AI.LlamaUbatchSize,
			"threads":              s.cfg.AI.LlamaThreads,
			"useMmap":              s.cfg.AI.LlamaUseMmap,
			"inFlightRequests":     0,
			"inferenceInProgress":  false,
		},
		"guestChat": map[string]any{"enabled": false, "beanPresent": false},
		"vision": map[string]any{
			"enabled": false, "endpoint": "", "localVisionReady": false,
			"native": map[string]any{"provider": "llama.cpp-native-vision", "enabled": false, "ready": false},
		},
		"ffmpeg":           map[string]any{"provider": "jave-all-deps-bundled", "ready": false, "executablePath": ""},
		"characterExtract": map[string]any{"provider": "onnxruntime-u2netp-bundled", "ready": false},
		"tts":              map[string]any{"enabled": false, "ready": false},
		"talkingHead":      map[string]any{"enabled": false, "ready": false},
		"martialCinematic": map[string]any{"enabled": false, "engine": "martial_cinematic", "ready": false},
		"ready":            inferenceReady,
		"status":           status,
	}
}

func (s *AiLocalOpsService) ListModels(llama *LlamaService) map[string]any {
	modelPath := s.cfg.AI.LlamaModelPath
	modelExists := llama.modelExists()
	reasoning := []map[string]any{}
	if modelExists {
		reasoning = append(reasoning, map[string]any{
			"file":                   filepath.Base(modelPath),
			"role":                   "reasoning",
			"profile":                "balanced",
			"estimatedRam":           "~4.2-5.0GB",
			"weakMachineRecommended": true,
			"configured":             true,
			"quantization":           detectQuantization(modelPath),
			"path":                   modelPath,
		})
	} else {
		reasoning = append(reasoning, map[string]any{
			"file":                   "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
			"role":                   "reasoning",
			"profile":                "balanced",
			"estimatedRam":           "~4.2-5.0GB",
			"weakMachineRecommended": true,
			"configured":             false,
			"quantization":           "q4_k_m",
			"weakMachineScore":        75,
		})
	}
	return map[string]any{
		"success":                      true,
		"localOnlyEnabled":             true,
		"configuredReasoningModel":     modelPath,
		"configuredModelQuantization":  detectQuantization(modelPath),
		"configuredModelExists":        modelExists,
		"discoveredCount":              boolCount(modelExists),
		"quantizationGuide": map[string]any{
			"recommendedOrderWeakMachine": []string{"q8_0", "q5_k_m", "q4_k_m", "q4_0", "q2_k"},
			"notes": []string{
				"q4_k_m — worker mặc định server 8GB: qwen2.5-coder-7b (SEO/code chất lượng cao hơn 1.5B)",
				"q8_0 — dev M1 / máy yếu: qwen2.5-coder-1.5b khi thiếu RAM",
			},
		},
		"reasoningCandidates": reasoning,
		"visionCandidates": []map[string]any{
			{"file": "moondream2-q4_k_m.gguf", "role": "vision", "profile": "very-light", "configured": false},
			{"file": "qwen2-vl-2b-instruct-q4_k_m.gguf", "role": "vision", "profile": "higher-quality", "configured": false},
		},
	}
}

func detectQuantization(path string) string {
	lower := strings.ToLower(path)
	for _, q := range []string{"q2_k", "q3_k", "q4_k_m", "q4_k_s", "q4_0", "q5_k_m", "q5_0", "q6_k", "q8_0"} {
		if strings.Contains(lower, q) {
			return q
		}
	}
	return "unknown"
}

func boolCount(v bool) int {
	if v {
		return 1
	}
	return 0
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
