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
	base := strings.TrimSpace(editorBase)
	preview := BuildMenuCompletionMergePreview(base, rawResult)
	payload := strings.TrimSpace(preview.MergedResponse)
	if payload == "" {
		payload = ExtractMenuDraftForCompletion(rawResult)
	}
	if payload == "" {
		payload = strings.TrimSpace(rawResult)
	}

	// Sanitize with 80% node retention guard.
	if sanitized := NormalizeMenuDraftJson(payload); sanitized != "" {
		baseNodes := CountMenuNodesFromDraft(base)
		sanitizedNodes := CountMenuNodesFromDraft(sanitized)
		if baseNodes <= 0 || sanitizedNodes >= (baseNodes*80+99)/100 {
			payload = sanitized
		}
	}

	baseNodes := CountMenuNodesFromDraft(base)
	mergedNodes := CountMenuNodesFromDraft(payload)
	menuEditorApplyReady := mergedNodes > baseNodes || baseNodes <= 0 ||
		preview.Edited > 0 || preview.Added > 0 || len(preview.PatchOps) > 0 ||
		(payload != "" && base != "" && payload != base)

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
