package services

import (
	"encoding/json"
	"strings"
)

// pickIncrementalEditPayload chooses the best patch-bearing step output (not prose synthesis).
func pickIncrementalEditPayload(outputs []string) string {
	bestScore := -1
	var best string
	for i := len(outputs) - 1; i >= 0; i-- {
		payload, score := scoreEditPayload(outputs[i])
		if score > bestScore {
			bestScore = score
			best = payload
		}
	}
	return best
}

func scoreEditPayload(raw string) (string, int) {
	for _, candidate := range editPayloadCandidates(raw) {
		cleaned := strings.TrimSpace(candidate)
		if cleaned == "" {
			continue
		}
		if strings.Contains(cleaned, `"patches"`) {
			return cleaned, 100
		}
		if strings.Contains(cleaned, `"textEdits"`) {
			return cleaned, 90
		}
		if draft := ExtractMenuDraftForCompletion(cleaned); draft != "" {
			return draft, 80
		}
		if json.Valid([]byte(cleaned)) && strings.Contains(cleaned, `"menu"`) {
			return cleaned, 70
		}
	}
	return "", -1
}

func editPayloadCandidates(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	out := []string{cleanMarkdownFromJSON(CleanLocalModelOutput(raw))}
	if c := extractJSONObjectCandidate(raw); c != "" {
		out = append(out, c)
	}
	return out
}

// MergeIncrementalMenuEdit applies incremental step output onto editor base without prose synthesis.
func MergeIncrementalMenuEdit(baseCode, aiOutput string) string {
	base := strings.TrimSpace(baseCode)
	ai := strings.TrimSpace(aiOutput)
	if base == "" || ai == "" {
		return ""
	}
	if preview := BuildMenuCompletionMergePreview(base, ai); preview.MergedResponse != "" {
		merged := strings.TrimSpace(preview.MergedResponse)
		if merged != "" && merged != base {
			return merged
		}
	}
	if merged := ApplyMenuTableFieldTextEdits(base, ai); merged != "" && merged != base {
		return merged
	}
	if draft := ExtractMenuDraftForCompletion(ai); draft != "" && draft != base {
		if preview := BuildMenuCompletionMergePreview(base, draft); preview.MergedResponse != "" {
			merged := strings.TrimSpace(preview.MergedResponse)
			if merged != "" && merged != base {
				return merged
			}
		}
	}
	return ""
}

// ApplyMenuTableFieldTextEdits merges menu table column objects from a textEdits envelope into base menu JSON.
func ApplyMenuTableFieldTextEdits(baseCode, raw string) string {
	base := strings.TrimSpace(baseCode)
	cleaned := cleanMarkdownFromJSON(strings.TrimSpace(raw))
	if base == "" || cleaned == "" || !strings.Contains(cleaned, "textEdits") {
		return ""
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(cleaned), &payload); err != nil {
		return ""
	}
	arr, ok := payload["textEdits"].([]any)
	if !ok || len(arr) == 0 {
		return ""
	}
	var parsed any
	if err := json.Unmarshal([]byte(base), &parsed); err != nil {
		return ""
	}
	menuList, wrapped := menuListFromRoot(parsed)
	if menuList == nil {
		return ""
	}
	touched := false
	for _, item := range arr {
		field, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if applyTableFieldPatch(menuList, field) {
			touched = true
		}
	}
	if !touched {
		return ""
	}
	return marshalMenuRoot(parsed, menuList, wrapped)
}

func menuListFromRoot(parsed any) ([]any, bool) {
	switch v := parsed.(type) {
	case map[string]any:
		if menu, ok := v["menu"].([]any); ok {
			return menu, true
		}
	case []any:
		return v, false
	}
	return nil, false
}

func marshalMenuRoot(parsed any, menuList []any, wrapped bool) string {
	if wrapped {
		if m, ok := parsed.(map[string]any); ok {
			m["menu"] = menuList
			if out := marshalParsedMenuJSON(m); out != "" {
				return out
			}
		}
	}
	wrappedObj := map[string]any{"menu": menuList}
	b, err := json.MarshalIndent(wrappedObj, "", "  ")
	if err != nil {
		return ""
	}
	return string(b)
}

func applyTableFieldPatch(menuList []any, field map[string]any) bool {
	fieldID := strings.TrimSpace(stringFromAny(field["id"]))
	fieldName := strings.TrimSpace(stringFromAny(field["f_name"]))
	if fieldID == "" && fieldName == "" {
		return false
	}
	return walkMenuNodes(menuList, func(node map[string]any) bool {
		table, ok := node["table"].([]any)
		if !ok {
			return false
		}
		for i, item := range table {
			row, ok := item.(map[string]any)
			if !ok {
				continue
			}
			rowID := strings.TrimSpace(stringFromAny(row["id"]))
			rowName := strings.TrimSpace(stringFromAny(row["f_name"]))
			if (fieldID != "" && rowID == fieldID) || (fieldName != "" && rowName == fieldName) {
				for k, v := range field {
					row[k] = v
				}
				table[i] = row
				node["table"] = table
				return true
			}
		}
		return false
	})
}

func walkMenuNodes(menuList []any, fn func(node map[string]any) bool) bool {
	for _, item := range menuList {
		node, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if fn(node) {
			return true
		}
		if children, ok := node["children"].([]any); ok && walkMenuNodes(children, fn) {
			return true
		}
	}
	return false
}
