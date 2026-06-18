package services

import (
	"context"
	"fmt"
	"strings"

	"csm_server/backend-go/internal/config"
)

// RunMenuSliceEditExecute plans slices from the user request, runs one focused LLM step per slice,
// and cumulatively merges patches into the working menu (unlimited effective output via merge).
func RunMenuSliceEditExecute(
	ctx context.Context,
	cfg config.AppConfig,
	llama *LlamaService,
	req *CodeStreamRequest,
	phase1 RunPhase1PipelineContext,
	writeSSE func(map[string]any),
	flush func(),
) (IncrementalPlanResult, error) {
	taskPlan := PlanEditTask(req, phase1.ResponseMode)

	working := CoerceMenuEditorPayload(ResolveMenuEditEditorBase(req))
	originalBase := working
	baseHealth := MenuEditorBaseHealth(working)
	if baseHealth == "truncated_or_invalid" {
		return IncrementalPlanResult{}, fmt.Errorf("menu editor JSON invalid or truncated — restore full menu JSON in editor")
	}

	deterministicFixed := 0
	if IsMenuTableFieldI18nComboRequest(req.Message) && working != "" {
		if merged, _, fixed := ApplyDeterministicMenuTableFieldFixes(working); fixed > 0 && merged != "" {
			working = merged
			deterministicFixed = fixed
		}
	}

	if !taskPlan.Enabled {
		if deterministicFixed > 0 && working != "" && working != originalBase {
			return IncrementalPlanResult{
				FinalText:   working,
				Plan:        ExecutionPlan{Reasoning: "deterministic field i18n fixes", Workspace: "menu"},
				StepOutputs: nil,
			}, nil
		}
		return IncrementalPlanResult{}, fmt.Errorf("empty edit task plan")
	}
	if len(taskPlan.Slices) == 0 {
		if working != "" && working != originalBase {
			return IncrementalPlanResult{
				FinalText:   working,
				Plan:        ExecutionPlan{Reasoning: taskPlan.RequestSummary, Workspace: "menu"},
				StepOutputs: nil,
			}, nil
		}
		return IncrementalPlanResult{}, fmt.Errorf("empty edit task plan")
	}

	if baseHealth == "empty" && strings.TrimSpace(req.Message) != "" {
		return IncrementalPlanResult{}, fmt.Errorf("menu editor appears empty")
	}

	writeSSE(map[string]any{
		"stage": "agentic_plan", "status": "done", "requestId": req.RequestID,
		"message": "Đã phân tích yêu cầu — chia " + fmt.Sprintf("%d", len(taskPlan.Slices)) + " vùng xử lý tuần tự",
		"planStepCount": len(taskPlan.Slices),
		"reasoning":     "Task planner: neo vào từng cột/table field cần sửa, patch surgical rồi merge tích lũy.",
		"planSteps":     editTaskSliceLabels(taskPlan.Slices),
		"targetSymbols": taskPlan.TargetSymbols,
		"slicePlanner":  true,
		"sourceChars":   taskPlan.SourceChars,
		"targetedFieldFix":        IsMenuTableFieldI18nComboRequest(req.Message),
		"deterministicFieldFixes": deterministicFixed,
	})
	flush()

	maxTok := incrementalStepMaxTokens(cfg, "edit")
	var stepOutputs []string
	total := len(taskPlan.Slices)

	for i, slice := range taskPlan.Slices {
		idx := i + 1
		stepID := fmt.Sprintf("slice_%d", idx)
		desc := slice.Objective
		writeSSE(AgenticStepSSE(req, idx, total, stepID, desc, "planned"))
		writeSSE(AgenticStepSSE(req, idx, total, stepID, desc, "running"))
		flush()

		var prompt string
		if slice.FieldIssue != nil {
			prompt = buildMenuFieldIssueFixPrompt(cfg, req, *slice.FieldIssue, working)
		} else {
			prompt = buildMenuSliceEditPrompt(cfg, req, phase1, slice, working, taskPlan)
		}
		text, err := llama.CompleteWithTokens(ctx, prompt, maxTok)
		if err != nil {
			writeSSE(AgenticStepSSE(req, idx, total, stepID, desc, "error"))
			writeSSE(map[string]any{
				"stage": "agentic_step_result", "requestId": req.RequestID,
				"stepIndex": idx, "stepTotal": total, "stepDescription": desc,
				"skipped": true, "error": err.Error(), "partial": i < total-1,
			})
			flush()
			continue
		}
		cleaned := strings.TrimSpace(CleanLocalModelOutput(text))
		stepOutputs = append(stepOutputs, cleaned)

		mergedThisStep := false
		if cleaned != "" {
			next := SafeMergeIncrementalMenuEdit(originalBase, working, cleaned)
			if next != "" && next != working {
				working = next
				mergedThisStep = true
			} else if working == "" {
				if draft := ExtractMenuDraftForCompletion(cleaned); draft != "" {
					if CountMenuNodesFromDraft(originalBase) <= 0 || MenuEditPassesNodeRetentionGuard(originalBase, draft) {
						if !IsLikelyHallucinatedGreenfieldMenu(draft) || CountMenuNodesFromDraft(originalBase) <= 0 {
							working = draft
							mergedThisStep = true
						}
					}
				}
			}
		}

		writeSSE(AgenticStepSSE(req, idx, total, stepID, desc, "done"))
		stepResult := map[string]any{
			"stage":           "agentic_step_result",
			"requestId":       req.RequestID,
			"contextType":     req.ContextType,
			"responseMode":    "edit",
			"stepIndex":       idx,
			"stepTotal":       total,
			"stepDescription": desc,
			"stepAction":      "edit",
			"stepScope":       slice.Kind,
			"qualityScore":    map[bool]int{true: 88, false: 62}[mergedThisStep],
			"partial":         i < total-1,
			"sliceMerged":     mergedThisStep,
			"finding":         truncateStr(cleaned, 2000),
		}
		if mergedThisStep {
			stepResult["mergeStats"] = map[string]any{"cumulative": true, "workingChars": len(working)}
		}
		writeSSE(stepResult)
		flush()
	}

	final := strings.TrimSpace(working)
	if final != "" && CountMenuNodesFromDraft(originalBase) > 0 {
		if !MenuEditPassesNodeRetentionGuard(originalBase, final) || IsLikelyHallucinatedGreenfieldMenu(final) {
			final = ""
		}
	}
	if final == "" {
		if payload := pickIncrementalEditPayload(stepOutputs); payload != "" {
			if merged := MergeIncrementalMenuEdit(originalBase, payload); merged != "" {
				if CountMenuNodesFromDraft(originalBase) <= 0 || MenuEditPassesNodeRetentionGuard(originalBase, merged) {
					final = merged
				}
			}
		}
	}
	return IncrementalPlanResult{
		FinalText:   final,
		Plan:        ExecutionPlan{Reasoning: taskPlan.RequestSummary, Workspace: "menu"},
		StepOutputs: stepOutputs,
	}, nil
}

func editTaskSliceLabels(slices []EditTaskSlice) []string {
	out := make([]string, 0, len(slices))
	for _, s := range slices {
		out = append(out, fmt.Sprintf("[%s %d/%d] %s", s.Kind, s.Index, s.Total, s.Objective))
	}
	return out
}

func buildMenuSliceEditPrompt(
	cfg config.AppConfig,
	req *CodeStreamRequest,
	phase1 RunPhase1PipelineContext,
	slice EditTaskSlice,
	workingMenu string,
	taskPlan EditTaskPlan,
) string {
	var sb strings.Builder
	sb.WriteString(baseSystemMin)
	sb.WriteString("\n\n")
	sb.WriteString(buildPromptLanguageBlock(req.UILang, req.Message))
	sb.WriteString(ResolveMenuJsonContractForLocal(cfg))
	sb.WriteString("\n")
	sb.WriteString(`[SLICE_EXECUTION_CONTRACT]
You execute ONE slice of a larger edit plan. Return ONLY patch JSON for this slice:
{"status":"success","patches":[{"action":"edit","nodeId":"...","after":{...}}]}
OR {"summary":"...","textEdits":[{"id":"menuId@@@@@f_name","f_cbo_query":"..."}]}
Use nodeId with @@@@@ for table column rows. Never return full menu tree unless editor was empty.
Never markdown fences. Never prose-only when a patch is possible.
[/SLICE_EXECUTION_CONTRACT]

`)
	sb.WriteString("[EDIT_TASK_PLAN]\n")
	sb.WriteString("Summary: ")
	sb.WriteString(taskPlan.RequestSummary)
	sb.WriteString(fmt.Sprintf("\nSlice %d/%d [%s]: %s\n", slice.Index, slice.Total, slice.Kind, slice.Objective))
	if len(slice.Symbols) > 0 {
		sb.WriteString("Symbols: ")
		sb.WriteString(strings.Join(slice.Symbols, ", "))
		sb.WriteString("\n")
	}
	sb.WriteString("[/EDIT_TASK_PLAN]\n\n")

	code := workingMenu
	if code == "" {
		code = strings.TrimSpace(req.CurrentCode)
	}
	editorMax := MaxOutgoingEditorChars(cfg, req.ContextType, "edit")
	if excerpt := extractLineSliceExcerpt(code, slice.LineStart, slice.LineEnd, editTaskPlannerSliceMaxChars()); excerpt != "" {
		sb.WriteString("[MENU_SLICE_EXCERPT lines ")
		sb.WriteString(fmt.Sprintf("%d-%d", slice.LineStart, slice.LineEnd))
		sb.WriteString("]\n")
		sb.WriteString(excerpt)
		sb.WriteString("\n[/MENU_SLICE_EXCERPT]\n\n")
	}
	if nodes := extractMenuNodesMatchingSymbols(code, slice.Symbols); nodes != "" {
		sb.WriteString("[MENU_NODE_CONTEXT]\n")
		sb.WriteString(truncateStr(nodes, editTaskPlannerSliceMaxChars()))
		sb.WriteString("\n[/MENU_NODE_CONTEXT]\n\n")
	}
	if code != "" && !IsEffectivelyEmptyMenuEditor(code) {
		sb.WriteString("[ACTIVE_EDITOR_MENU_JSON]\n")
		sb.WriteString(truncateStr(code, editorMax))
		sb.WriteString("\n[/ACTIVE_EDITOR_MENU_JSON]\n\n")
	}
	if phase1.ComprehendBlock != "" {
		sb.WriteString(truncateStr(phase1.ComprehendBlock, 6000))
	}
	if phase1.TenantRAG.Block != "" {
		sb.WriteString(truncateStr(phase1.TenantRAG.Block, 5000))
	}
	sb.WriteString("[USER_REQUEST]\n")
	sb.WriteString(truncateStr(req.Message, 8000))
	sb.WriteString("\n[/USER_REQUEST]\n")

	cap := EffectiveLocalPromptCap(cfg, req.ContextType, "edit")
	return ClampPromptForLocalProvider(cfg, PrepareLocalProviderPrompt(sb.String(), cap), req.ContextType, "edit")
}
