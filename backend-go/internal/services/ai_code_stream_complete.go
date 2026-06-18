package services

import (
	"encoding/json"
	"fmt"
	"strings"
)

// CodeStreamCompletion assembles the SSE `complete` event payload (Java parity subset).
func CodeStreamCompletion(req *CodeStreamRequest, rawResult, editorBase, modelLabel string, elapsedMs int64) map[string]any {
	result := CleanLocalModelOutput(rawResult)
	responseMode := ResolveResponseMode(req)
	editorBase = strings.TrimSpace(editorBase)
	if req != nil && req.ContextType == "menu_json" && responseMode == "edit" {
		if resolved := ResolveMenuEditEditorBase(req); resolved != "" {
			editorBase = resolved
		}
	}

	complete := map[string]any{
		"stage":         "complete",
		"requestId":     req.RequestID,
		"status":        "completed",
		"reason_code":   "completed",
		"contextType":   req.ContextType,
		"responseMode":  responseMode,
		"elapsedMs":     elapsedMs,
		"streamedChars": len(result),
		"model":         modelLabel,
		"localProviderPrimaryUsed": true,
	}

	if req.ContextType == "menu_json" && responseMode == "edit" {
		assembleMenuEditCompletion(complete, editorBase, result)
		return complete
	}

	if req.ContextType == "code" && responseMode == "edit" {
		assembleCodeEditCompletion(complete, req, editorBase, result)
		return complete
	}

	complete["fullResponse"] = result
	if responseMode == "analyze" {
		complete["outputShape"] = "prose"
	}
	return complete
}

func assembleMenuEditCompletion(complete map[string]any, editorBase, rawResult string) {
	base := CoerceMenuEditorPayload(strings.TrimSpace(editorBase))
	rawResult = strings.TrimSpace(rawResult)
	if MenuEditorBaseHealth(base) == "truncated_or_invalid" {
		if draft := CoerceMenuEditorPayload(rawResult); IsPublishableMenuDraft(draft) && CountMenuNodesFromDraft(draft) > 0 && !IsLikelyHallucinatedGreenfieldMenu(draft) {
			base = draft
		} else {
			complete["fullResponse"] = ""
			complete["outputShape"] = "menu_json"
			complete["finalOutputGate"] = map[string]any{
				"passed": false, "reasonCode": "menu_editor_json_truncated",
			}
			return
		}
	}
	// Reject prose synthesis accidentally passed as menu edit output.
	if strings.HasPrefix(rawResult, "## ") || strings.Contains(rawResult, "## Chi tiết từng bước") {
		if payload := extractJSONObjectCandidate(rawResult); payload != "" {
			rawResult = payload
		} else if merged := pickIncrementalEditPayload([]string{rawResult}); merged != "" {
			rawResult = merged
		} else {
			complete["fullResponse"] = ""
			complete["outputShape"] = "menu_json"
			complete["finalOutputGate"] = map[string]any{
				"passed": false, "reasonCode": "menu_edit_prose_rejected",
			}
			return
		}
	}
	if base != "" {
		aiDraft := ExtractMenuDraftForCompletion(rawResult)
		isPatch := strings.Contains(rawResult, `"patches"`) || strings.Contains(rawResult, `"textEdits"`)
		if aiDraft != "" && !isPatch && CountMenuNodesFromDraft(base) > 0 {
			if IsLikelyHallucinatedGreenfieldMenu(aiDraft) || !menuFullDraftOverlapsBase(base, aiDraft) {
				complete["fullResponse"] = ""
				complete["outputShape"] = "menu_json"
				complete["finalOutputGate"] = map[string]any{
					"passed": false, "reasonCode": "menu_edit_hallucinated_draft_rejected",
				}
				return
			}
		}
		if merged := MergeIncrementalMenuEdit(base, rawResult); merged != "" {
			rawResult = merged
		}
	}

	preview := BuildMenuCompletionMergePreview(base, rawResult)
	payload := strings.TrimSpace(preview.MergedResponse)
	if payload == "" && CountMenuNodesFromDraft(base) <= 0 {
		payload = ExtractMenuDraftForCompletion(rawResult)
	}
	if payload == "" || IsMenuPatchEnvelopePayload(payload) {
		if base != "" && IsPublishableMenuDraft(base) {
			complete["fullResponse"] = ""
			complete["outputShape"] = "menu_json"
			complete["finalOutputGate"] = map[string]any{
				"passed": false, "reasonCode": "menu_patch_merge_failed_keep_base",
			}
			return
		}
		payload = strings.TrimSpace(rawResult)
	}

	if !IsPublishableMenuDraft(payload) {
		complete["fullResponse"] = ""
		complete["outputShape"] = "menu_json"
		complete["finalOutputGate"] = map[string]any{
			"passed": false, "reasonCode": "menu_edit_not_publishable_draft",
		}
		return
	}

	baseNodes := CountMenuNodesFromDraft(base)
	if baseNodes > 0 {
		if !MenuEditPassesNodeRetentionGuard(base, payload) {
			complete["fullResponse"] = ""
			complete["outputShape"] = "menu_json"
			complete["finalOutputGate"] = map[string]any{
				"passed": false, "reasonCode": "menu_edit_node_retention_failed",
			}
			return
		}
		if IsLikelyHallucinatedGreenfieldMenu(payload) && !menuFullDraftOverlapsBase(base, payload) {
			complete["fullResponse"] = ""
			complete["outputShape"] = "menu_json"
			complete["finalOutputGate"] = map[string]any{
				"passed": false, "reasonCode": "menu_edit_hallucinated_draft_rejected",
			}
			return
		}
		if preview.Added > 0 && preview.Edited == 0 && preview.Deleted == 0 {
			complete["fullResponse"] = ""
			complete["outputShape"] = "menu_json"
			complete["finalOutputGate"] = map[string]any{
				"passed": false, "reasonCode": "menu_edit_unrelated_nodes_rejected",
			}
			return
		}
	} else if IsLikelyHallucinatedGreenfieldMenu(payload) {
		complete["fullResponse"] = ""
		complete["outputShape"] = "menu_json"
		complete["finalOutputGate"] = map[string]any{
			"passed": false, "reasonCode": "menu_edit_hallucinated_draft_rejected",
		}
		return
	}

	// Sanitize with 80% node retention guard.
	if sanitized := NormalizeMenuDraftJson(payload); sanitized != "" {
		sanitizedNodes := CountMenuNodesFromDraft(sanitized)
		if baseNodes <= 0 || sanitizedNodes >= (baseNodes*80+99)/100 {
			payload = sanitized
		}
	}

	mergedNodes := CountMenuNodesFromDraft(payload)
	menuEditorApplyReady := (preview.Edited > 0 || preview.Added > 0 || len(preview.PatchOps) > 0 ||
		(mergedNodes > baseNodes && baseNodes > 0)) && IsPublishableMenuDraft(payload)

	mergeStats := map[string]any{
		"added": preview.Added, "edited": preview.Edited, "deleted": preview.Deleted,
	}
	if preview.Added == 0 && preview.Edited == 0 && preview.Deleted == 0 && mergedNodes > baseNodes {
		mergeStats["added"] = mergedNodes - baseNodes
	}

	if len(preview.PatchOps) > 0 {
		complete["patchOps"] = jsonMarshalPatchOps(preview.PatchOps)
	}
	complete["mergeStats"] = mergeStats
	complete["patchOpCount"] = len(preview.PatchOps)
	complete["outputShape"] = "menu_json"

	if menuEditorApplyReady {
		complete["menuEditorApplyReady"] = true
		complete["flowConfirmedByLocal"] = true
	}

	requestID, _ := complete["requestId"].(string)
	deferLarge := len(payload) > menuApplyDeferChars

	if deferLarge && menuEditorApplyReady {
		CacheMenuEditorApplyPayload(requestID, payload, mergeStats)
		complete["menuEditorApplyFetch"] = true
		complete["menuEditorApplyChars"] = len(payload)
		complete["fullResponse"] = ""
	} else {
		complete["fullResponse"] = payload
	}

	// Line-based text edits when merge grew menu but no streamed edits.
	if menuEditorApplyReady && base != "" && payload != base {
		edits := BuildLineTextEdits(base, payload)
		if len(edits) > 0 {
			complete["textEdits"] = textEditsToMaps(edits)
			complete["textEditsCount"] = len(edits)
			complete["codeStreamTextEditsEmittedCount"] = len(edits)
		}
	}

	complete["finalOutputGate"] = map[string]any{
		"passed": true, "reasonCode": "menu_local_merge_ok",
	}
}

func assembleCodeEditCompletion(complete map[string]any, req *CodeStreamRequest, editorBase, rawResult string) {
	result := strings.TrimSpace(rawResult)
	base := strings.TrimSpace(editorBase)

	if IsLineItemsPdfImport(req) {
		merged := ResolvePrintImportTriggerBody(base, result)
		complete["fullResponse"] = merged
		complete["flowConfirmedByLocal"] = IsPrintTriggerBodyComplete(merged)
		complete["outputShape"] = "code"
		if merged != result {
			complete["printImportMergedFromSeed"] = true
		}
		complete["finalOutputGate"] = map[string]any{
			"passed":     IsPrintTriggerBodyComplete(merged),
			"reasonCode": "print_import_merge",
		}
		return
	}

	// Try textEdits JSON envelope from model.
	edits := parseTextEditsFromModelOutput(result)
	if len(edits) > 0 && base != "" {
		complete["textEdits"] = textEditsToMaps(edits)
		complete["textEditsCount"] = len(edits)
		complete["codeStreamTextEditsEmittedCount"] = len(edits)
		complete["flowConfirmedByLocal"] = true
		complete["fullResponse"] = result
		complete["outputShape"] = "textEdits"
		complete["finalOutputGate"] = map[string]any{"passed": true, "reasonCode": "code_text_edits_ok"}
		return
	}

	if result != "" && result != base {
		complete["fullResponse"] = result
		complete["flowConfirmedByLocal"] = true
		lineEdits := BuildLineTextEdits(base, result)
		if len(lineEdits) > 0 {
			complete["textEdits"] = textEditsToMaps(lineEdits)
			complete["textEditsCount"] = len(lineEdits)
		}
	}
	complete["outputShape"] = "code"
	complete["finalOutputGate"] = map[string]any{"passed": true, "reasonCode": "code_local_ok"}
}

func parseTextEditsFromModelOutput(raw string) []TextEdit {
	raw = cleanMarkdownFromJSON(strings.TrimSpace(raw))
	if raw == "" || !strings.Contains(raw, "textEdits") {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil
	}
	arr, ok := payload["textEdits"].([]any)
	if !ok || len(arr) == 0 {
		return nil
	}
	var edits []TextEdit
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		edits = append(edits, TextEdit{
			StartLine:   intFromAny(m["startLine"]),
			EndLine:     intFromAny(m["endLine"]),
			Replacement: stringFromAny(m["replacement"]),
			Action:      stringFromAny(m["action"]),
		})
	}
	return edits
}

func jsonMarshalPatchOps(ops []PatchOp) []any {
	b, err := json.Marshal(ops)
	if err != nil {
		return nil
	}
	var out []any
	_ = json.Unmarshal(b, &out)
	return out
}

func intFromAny(v any) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	case int64:
		return int(x)
	default:
		return 0
	}
}

func stringFromAny(v any) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(v))
}
