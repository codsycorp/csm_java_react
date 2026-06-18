package services

import (
	"context"
	"fmt"
	"strings"

	"csm_server/backend-go/internal/config"
)

// IncrementalPlanResult is the merged output after plan-then-execute.
type IncrementalPlanResult struct {
	FinalText   string
	Plan        ExecutionPlan
	StepOutputs []string
}

func incrementalStepMaxTokens(cfg config.AppConfig, responseMode string) uint32 {
	base := EffectiveInferenceMaxTokens(cfg, responseMode)
	if IsConstrained8GbTier(cfg) && base > 768 {
		return 768
	}
	return base
}

// RunIncrementalPlanExecute runs plan-then-execute: holistic plan → one LLM call per step → synthesis.
func RunIncrementalPlanExecute(
	ctx context.Context,
	cfg config.AppConfig,
	llama *LlamaService,
	req *CodeStreamRequest,
	phase1 RunPhase1PipelineContext,
	writeSSE func(map[string]any),
	flush func(),
) (IncrementalPlanResult, error) {
	retrieved := phase1.TenantRAG.Block + phase1.LearningBlock + phase1.ComprehendBlock
	plan := GenerateExecutionPlan(req, phase1.ResponseMode, retrieved)
	if len(plan.Steps) == 0 {
		return IncrementalPlanResult{}, fmt.Errorf("empty execution plan")
	}

	writeSSE(map[string]any{
		"stage": "agentic_plan", "status": "done", "requestId": req.RequestID,
		"message": "Đã lập kế hoạch từng bước — bắt đầu thực thi",
		"planStepCount": len(plan.Steps), "reasoning": plan.Reasoning,
		"planSteps": planStepLabels(plan.Steps),
	})
	flush()

	var stepOutputs []string
	total := len(plan.Steps)
	maxTok := incrementalStepMaxTokens(cfg, phase1.ResponseMode)
	workingMenu := strings.TrimSpace(req.CurrentCode)

	for i, step := range plan.Steps {
		idx := i + 1
		stepID := fmt.Sprintf("step_%d", idx)
		writeSSE(AgenticStepSSE(req, idx, total, stepID, step.Description, "planned"))
		writeSSE(AgenticStepSSE(req, idx, total, stepID, step.Description, "running"))
		flush()

		prompt := buildIncrementalStepPrompt(cfg, req, phase1, plan, step, idx, total, stepOutputs)
		text, err := llama.CompleteWithTokens(ctx, prompt, maxTok)
		if err != nil {
			writeSSE(AgenticStepSSE(req, idx, total, stepID, step.Description, "error"))
			writeSSE(map[string]any{
				"stage": "agentic_step_result", "requestId": req.RequestID,
				"stepIndex": idx, "stepTotal": total, "stepDescription": step.Description,
				"skipped": true, "lowConfidence": true, "qualityScore": 40,
				"evidenceReason": "step_inference_error", "error": err.Error(),
				"partial": i < total-1,
			})
			flush()
			continue
		}
		cleaned := strings.TrimSpace(CleanLocalModelOutput(text))
		if cleaned == "" {
			cleaned = "(không có nội dung từ bước này)"
		}
		stepOutputs = append(stepOutputs, cleaned)

		if phase1.ResponseMode == "edit" && isMenuJSONContext(req.ContextType) && workingMenu != "" {
			if merged := MergeIncrementalMenuEdit(workingMenu, cleaned); merged != "" && merged != workingMenu {
				workingMenu = merged
			}
		}

		writeSSE(AgenticStepSSE(req, idx, total, stepID, step.Description, "done"))
		writeSSE(map[string]any{
			"stage":           "agentic_step_result",
			"requestId":       req.RequestID,
			"contextType":     req.ContextType,
			"responseMode":    phase1.ResponseMode,
			"stepIndex":       idx,
			"stepTotal":       total,
			"stepDescription": step.Description,
			"stepAction":      step.Action,
			"stepScope":       step.Scope,
			"qualityScore":    78,
			"lowConfidence":   len(cleaned) < 40,
			"partial":         i < total-1,
			"finding":           truncateStr(cleaned, 2000),
		})
		if phase1.ResponseMode == "analyze" {
			writeSSE(map[string]any{
				"stage": "streaming", "requestId": req.RequestID,
				"chunk": cleaned + "\n\n", "localProviderPrimary": true,
			})
		}
		flush()
	}

	final := synthesizeIncrementalFinal(cfg, req, phase1, plan, stepOutputs)
	if phase1.ResponseMode == "edit" && isMenuJSONContext(req.ContextType) && workingMenu != "" && workingMenu != strings.TrimSpace(req.CurrentCode) {
		final = workingMenu
	}
	return IncrementalPlanResult{FinalText: final, Plan: plan, StepOutputs: stepOutputs}, nil
}

func planStepLabels(steps []ExecutionPlanStep) []string {
	out := make([]string, 0, len(steps))
	for _, s := range steps {
		line := fmt.Sprintf("[%s] %s", s.Action, s.Description)
		out = append(out, line)
	}
	return out
}

func buildIncrementalStepPrompt(
	cfg config.AppConfig,
	req *CodeStreamRequest,
	phase1 RunPhase1PipelineContext,
	plan ExecutionPlan,
	step ExecutionPlanStep,
	stepIndex, stepTotal int,
	prior []string,
) string {
	mode := phase1.ResponseMode
	var sb strings.Builder
	sb.WriteString(baseSystemAnalyzeMin)
	sb.WriteString("\n\n")
	sb.WriteString(buildPromptLanguageBlock(req.UILang, req.Message))
	sb.WriteString(incrementalStepContract(mode, step.Action))
	sb.WriteByte('\n')
	sb.WriteString("[EXECUTION_PLAN]\n")
	sb.WriteString("Reasoning: ")
	sb.WriteString(plan.Reasoning)
	sb.WriteString("\nStep ")
	sb.WriteString(fmt.Sprintf("%d/%d", stepIndex, stepTotal))
	sb.WriteString(": [")
	sb.WriteString(step.Action)
	sb.WriteString("] ")
	sb.WriteString(step.Description)
	sb.WriteString("\nFocus: ")
	sb.WriteString(step.Focus)
	sb.WriteString("\n[/EXECUTION_PLAN]\n\n")

	if isMenuJSONContext(req.ContextType) && strings.TrimSpace(req.CurrentCode) != "" {
		editorMax := MaxOutgoingEditorChars(cfg, req.ContextType, mode)
		sb.WriteString("[ACTIVE_EDITOR_MENU_JSON]\n")
		sb.WriteString(truncateStr(req.CurrentCode, editorMax))
		sb.WriteString("\n[/ACTIVE_EDITOR_MENU_JSON]\n\n")
	} else if strings.TrimSpace(req.CurrentCode) != "" {
		sb.WriteString("[ACTIVE_EDITOR_CODE]\n")
		sb.WriteString(truncateStr(req.CurrentCode, 10_000))
		sb.WriteString("\n[/ACTIVE_EDITOR_CODE]\n\n")
	}
	if phase1.ComprehendBlock != "" {
		sb.WriteString(phase1.ComprehendBlock)
	}
	if phase1.TenantRAG.Block != "" {
		sb.WriteString(phase1.TenantRAG.Block)
	}
	if len(prior) > 0 {
		sb.WriteString("[PRIOR_STEP_FINDINGS]\n")
		for i, p := range prior {
			sb.WriteString(fmt.Sprintf("### Step %d\n%s\n\n", i+1, truncateStr(p, 1500)))
		}
		sb.WriteString("[/PRIOR_STEP_FINDINGS]\n\n")
	}
	sb.WriteString("[USER_REQUEST]\n")
	sb.WriteString(truncateStr(req.Message, 4000))
	sb.WriteString("\n[/USER_REQUEST]\n")

	cap := EffectiveLocalPromptCap(cfg, req.ContextType, mode)
	return ClampPromptForLocalProvider(cfg, PrepareLocalProviderPrompt(sb.String(), cap), req.ContextType, mode)
}

func incrementalStepContract(responseMode, action string) string {
	if responseMode == "edit" && action != "analyze" && action != "inspect" && action != "search" {
		return `You execute ONE plan step for CSM editor.
Return ONLY valid JSON when this step produces a patch:
{"status":"success","patches":[{"action":"edit","nodeId":"...","after":{...}}]}
OR {"summary":"...","textEdits":[{"id":"...","f_name":"...","f_cbo_query":"..."}]}
If this step is inspect/search only, return plain prose findings (no JSON) — max 6 bullets.
NEVER return a full regenerated menu tree unless the editor was empty greenfield.
NEVER wrap JSON in markdown fences.
Never refuse. Cite concrete field names from ACTIVE_EDITOR_MENU_JSON.
End immediately after this step's output.`
	}
	return `You execute ONE analysis step in a larger plan.
Answer in plain prose with concrete evidence from ACTIVE_EDITOR (field names, f_types, f_header keys, line refs).
Never refuse. Build on PRIOR_STEP_FINDINGS when present.
Use 3-6 bullet points for this step only. Do not repeat the full plan.
End immediately after this step's answer.`
}

func synthesizeIncrementalFinal(cfg config.AppConfig, req *CodeStreamRequest, phase1 RunPhase1PipelineContext, plan ExecutionPlan, stepOutputs []string) string {
	if len(stepOutputs) == 0 {
		return ""
	}
	if phase1.ResponseMode == "edit" {
		if payload := pickIncrementalEditPayload(stepOutputs); payload != "" {
			if isMenuJSONContext(req.ContextType) && strings.TrimSpace(req.CurrentCode) != "" {
				if merged := MergeIncrementalMenuEdit(req.CurrentCode, payload); merged != "" {
					return merged
				}
			}
			return payload
		}
		return ""
	}
	if len(stepOutputs) == 1 {
		return stepOutputs[0]
	}
	last := stepOutputs[len(stepOutputs)-1]
	if phase1.ResponseMode == "analyze" && len(last) > 120 {
		return last
	}
	var sb strings.Builder
	sb.WriteString("## Kết luận\n")
	sb.WriteString(last)
	sb.WriteString("\n\n## Chi tiết từng bước\n")
	for i, out := range stepOutputs[:len(stepOutputs)-1] {
		sb.WriteString(fmt.Sprintf("\n### Bước %d\n%s\n", i+1, out))
	}
	return strings.TrimSpace(sb.String())
}
