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
	return "llama.cpp"
}

func (s *AiLocalOpsService) Health(llama *LlamaService) map[string]any {
	modelPath := s.cfg.AI.LlamaModelPath
	modelOnDisk := llama != nil && llama.ModelOnDisk()
	nativeReady := llama != nil && llama.UsesNative()
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
			"profile":                "balanced-8gb",
			"estimatedRam":           estimateModelRam(modelPath),
			"weakMachineRecommended": isWeakMachineModel(modelPath),
			"configured":             true,
			"quantization":           detectQuantization(modelPath),
			"path":                   modelPath,
		})
	} else {
		reasoning = append(reasoning, map[string]any{
			"file":                   "qwen2.5-coder-1.5b-instruct-q8_0.gguf",
			"role":                   "reasoning",
			"profile":                "balanced-8gb",
			"estimatedRam":           "~1.5-1.8GB",
			"weakMachineRecommended": true,
			"configured":             false,
			"quantization":           "q8_0",
			"weakMachineScore":        92,
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
				"q8_0 + 1.5B — mặc định server 8GB/4CPU (Go profile config.local-8gb.env)",
				"q4_k_m + 7B — chất lượng cao hơn, cần RAM dư: ./scripts/download-ai-local-models.sh 8gb-7b",
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

func estimateModelRam(path string) string {
	lower := strings.ToLower(filepath.Base(path))
	switch {
	case strings.Contains(lower, "1.5b") && strings.Contains(lower, "q8"):
		return "~1.5-1.8GB"
	case strings.Contains(lower, "1.5b"):
		return "~1.0-1.6GB"
	case strings.Contains(lower, "7b") && strings.Contains(lower, "q4"):
		return "~4.2-5.0GB"
	case strings.Contains(lower, "7b"):
		return "~3.5-5.5GB"
	default:
		return "~2-5GB"
	}
}

func isWeakMachineModel(path string) bool {
	lower := strings.ToLower(filepath.Base(path))
	return strings.Contains(lower, "1.5b") || strings.Contains(lower, "q8_0")
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
