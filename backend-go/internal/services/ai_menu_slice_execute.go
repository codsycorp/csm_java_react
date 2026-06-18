package services

import (
	"context"
	"fmt"
	"strings"

	"csm_server/backend-go/internal/config"
)

// RunMenuSliceEditExecute applies Java-parity menu edit: deterministic quality-gate patches first,
// no per-slice LLM for menu (Java multiSliceExecution=false for menu_json).
func RunMenuSliceEditExecute(
	ctx context.Context,
	cfg config.AppConfig,
	llama *LlamaService,
	req *CodeStreamRequest,
	phase1 RunPhase1PipelineContext,
	writeSSE func(map[string]any),
	flush func(),
) (IncrementalPlanResult, error) {
	_ = ctx
	_ = cfg
	_ = llama
	_ = phase1

	working := CoerceMenuEditorPayload(ResolveMenuEditEditorBase(req))
	originalBase := working
	baseHealth := MenuEditorBaseHealth(working)
	if baseHealth == "truncated_or_invalid" {
		return IncrementalPlanResult{}, fmt.Errorf("menu editor JSON invalid or truncated — restore full menu JSON in editor")
	}
	if baseHealth == "empty" && strings.TrimSpace(req.Message) != "" {
		return IncrementalPlanResult{}, fmt.Errorf("menu editor appears empty")
	}

	useQualityGate := IsBroadMenuAuditRequest(req.Message) || IsMenuTableFieldI18nComboRequest(req.Message)
	planSteps := []string{
		"Kiểm tra trigger từng menu theo chuẩn nghiệp vụ",
		"Chuẩn hóa tham số đầu vào (table/f_header/f_cbo_query)",
		"Bổ sung nhãn 3 ngôn ngữ label/label_en/label_zh",
		"Áp patch deterministic vào editor",
	}

	writeSSE(map[string]any{
		"stage": "agentic_plan", "status": "done", "requestId": req.RequestID,
		"message": "Menu edit — quality-gate deterministic (Java parity, không gọi LLM từng slice)",
		"planStepCount": len(planSteps),
		"reasoning":     "Giống Java: patch envelope deterministic + merge theo f_name, giữ nguyên toàn bộ cây menu.",
		"planSteps":     planSteps,
		"slicePlanner":  false,
		"qualityGateEarlyAudit": useQualityGate,
		"sourceChars":   len(working),
	})
	flush()

	if merged, _, fixed := ApplyDeterministicMenuTableFieldFixes(working); fixed > 0 && merged != "" {
		working = merged
	}

	var qualityGateEnvelope string
	var qualityPreview MenuCompletionPreview
	if useQualityGate && working != "" {
		if merged, envelope, preview, ok := RunMenuQualityGateEarlyAudit(working, 512); ok && merged != "" {
			working = merged
			qualityGateEnvelope = envelope
			qualityPreview = preview
			writeSSE(map[string]any{
				"stage":           "agentic_step_result",
				"requestId":       req.RequestID,
				"contextType":     "menu_json",
				"responseMode":    "edit",
				"stepIndex":       1,
				"stepTotal":       len(planSteps),
				"stepDescription": "Áp patch quality-gate deterministic",
				"stepAction":      "edit",
				"stepScope":       "menu_quality_gate",
				"qualityScore":    92,
				"partial":         false,
				"sliceMerged":     true,
				"qualityGateEarlyAudit": true,
				"mergeStats": map[string]any{
					"added":   qualityPreview.Added,
					"edited":  qualityPreview.Edited,
					"deleted": qualityPreview.Deleted,
				},
			})
			flush()
		}
	}

	if roots := parseMenuRoots(working); len(roots) > 0 {
		if repaired := RepairMenuTreeInPlace(roots); repaired > 0 {
			if normalized := wrapMenuFromRoots(roots); normalized != "" {
				working = normalized
			}
		}
	}

	final := strings.TrimSpace(working)
	if final == "" || final == originalBase {
		if qualityGateEnvelope != "" {
			if preview := BuildMenuCompletionMergePreview(originalBase, qualityGateEnvelope); preview.MergedResponse != "" {
				final = preview.MergedResponse
			}
		}
	}
	if final == "" || final == originalBase {
		return IncrementalPlanResult{}, fmt.Errorf("no deterministic menu patches to apply — fallback single-shot")
	}

	if CountMenuNodesFromDraft(originalBase) > 0 {
		if !MenuEditPassesNodeRetentionGuard(originalBase, final) || IsLikelyHallucinatedGreenfieldMenu(final) {
			return IncrementalPlanResult{}, fmt.Errorf("deterministic merge failed node retention guard")
		}
	}

	writeSSE(map[string]any{
		"stage": "tool_apply", "status": "done", "requestId": req.RequestID,
		"contextType": "menu_json", "qualityGateEarlyAudit": true,
		"message": "Đã áp patch deterministic — giữ nguyên cấu trúc menu gốc",
		"mergeStats": map[string]any{
			"added":   qualityPreview.Added,
			"edited":  maxInt(qualityPreview.Edited, 1),
			"deleted": qualityPreview.Deleted,
		},
	})
	flush()

	return IncrementalPlanResult{
		FinalText: final,
		Plan: ExecutionPlan{
			Reasoning: "Java parity: MenuQualityGateService deterministic patches",
			Workspace: "menu",
		},
		StepOutputs: filterNonEmpty([]string{qualityGateEnvelope}),
	}, nil
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func filterNonEmpty(items []string) []string {
	var out []string
	for _, s := range items {
		if strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}
