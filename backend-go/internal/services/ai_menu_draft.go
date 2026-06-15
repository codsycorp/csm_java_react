package services

import (
	"encoding/json"
	"regexp"
	"strings"
)

var menuTrailingNoiseMarkers = []string{
	"FOLLOW-UP QUESTIONS", "Follow-up questions", "FOLLOW UP QUESTIONS",
	"Câu hỏi tiếp theo", "Next questions", "Gợi ý tiếp theo",
}

var menuPromptEchoMarkers = []string{
	"# CSM AI Menu Master Prompt v2",
	"# CSM Multi-tenant AI Menu Master Prompt",
	"## AUTO_LOADED_MENU_SYSTEM_KNOWLEDGE",
	"## B) INPUT CONTRACT (FROM CHAT OR API)",
	"## C) CORE MANDATE",
}

// NormalizeMenuDraftJson always emits {"menu":[...]} pretty JSON or "".
func NormalizeMenuDraftJson(text string) string {
	raw := strings.TrimSpace(text)
	if raw == "" {
		return ""
	}
	var parsed any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return ""
	}
	switch v := parsed.(type) {
	case []any:
		return wrapMenuPayload(v)
	case map[string]any:
		if code, ok := v["code"].(string); ok {
			code = strings.TrimSpace(code)
			if code != "" && code != raw {
				if from := NormalizeMenuDraftJson(code); from != "" {
					return from
				}
			}
		}
		if menu, ok := v["menu"].([]any); ok {
			return wrapMenuPayload(menu)
		}
		if menus, ok := v["menus"].([]any); ok {
			return wrapMenuPayload(menus)
		}
		if data, ok := v["data"].(map[string]any); ok {
			if menu, ok := data["menu"].([]any); ok {
				return wrapMenuPayload(menu)
			}
		}
		if isLikelyMenuNodeMap(v) {
			return wrapMenuPayload([]any{v})
		}
	}
	return ""
}

func wrapMenuPayload(menu []any) string {
	out := map[string]any{"menu": menu}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return ""
	}
	return string(b)
}

func isLikelyMenuNodeMap(m map[string]any) bool {
	id, _ := m["id"].(string)
	if strings.TrimSpace(id) == "" {
		return false
	}
	for _, k := range []string{"children", "table", "type_form", "table_name"} {
		if _, ok := m[k]; ok {
			return true
		}
	}
	return false
}

// ExtractMenuDraftForCompletion strips fences/echo and normalizes menu JSON.
func ExtractMenuDraftForCompletion(rawResponse string) string {
	original := rawResponse
	raw := stripMenuPromptEcho(stripMenuDraftTrailingNoise(sanitizePromptEchoLeakage(strings.TrimSpace(rawResponse))))

	candidates := []string{}
	if c := extractLikelyMenuJSONCandidate(original); c != "" {
		candidates = append(candidates, stripMenuDraftTrailingNoise(c))
	}
	if raw != "" {
		candidates = append(candidates, raw)
	}
	if cleaned := cleanMarkdownFromJSON(raw); cleaned != "" && cleaned != raw {
		candidates = append(candidates, stripMenuDraftTrailingNoise(cleaned))
	}
	if c := extractLikelyMenuJSONCandidate(raw); c != "" {
		candidates = append(candidates, stripMenuDraftTrailingNoise(c))
	}

	for _, candidate := range candidates {
		if n := NormalizeMenuDraftJson(candidate); n != "" {
			return n
		}
	}
	return ""
}

func stripMenuDraftTrailingNoise(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	cut := -1
	for _, marker := range menuTrailingNoiseMarkers {
		if idx := strings.Index(raw, marker); idx >= 0 && (cut < 0 || idx < cut) {
			cut = idx
		}
	}
	if cut < 0 {
		return raw
	}
	return strings.TrimSpace(raw[:cut])
}

func stripMenuPromptEcho(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	earliest := -1
	for _, marker := range menuPromptEchoMarkers {
		if idx := strings.Index(raw, marker); idx >= 0 && (earliest < 0 || idx < earliest) {
			earliest = idx
		}
	}
	if earliest < 0 {
		return raw
	}
	return strings.TrimSpace(raw[:earliest])
}

func sanitizePromptEchoLeakage(raw string) string {
	// Drop common Qwen chat-template residue before JSON extraction.
	re := regexp.MustCompile(`(?s)<\|im_end\|>.*`)
	return strings.TrimSpace(re.ReplaceAllString(raw, ""))
}

func cleanMarkdownFromJSON(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

func extractLikelyMenuJSONCandidate(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var candidates []string
	searchFrom := 0
	for {
		idx := strings.Index(raw[searchFrom:], `"menu"`)
		if idx < 0 {
			break
		}
		menuKeyIdx := searchFrom + idx
		openBrace := strings.LastIndex(raw[:menuKeyIdx], "{")
		if openBrace >= 0 {
			if closeBrace := findMatchingBrace(raw, openBrace); closeBrace > openBrace {
				candidate := strings.TrimSpace(raw[openBrace : closeBrace+1])
				if candidate != "" {
					candidates = append(candidates, candidate)
				}
			}
		}
		searchFrom = menuKeyIdx + 6
	}
	// Prefer longest valid candidate.
	best := ""
	for _, c := range candidates {
		if len(c) > len(best) {
			if NormalizeMenuDraftJson(c) != "" {
				best = c
			}
		}
	}
	return best
}

func findMatchingBrace(s string, open int) int {
	if open < 0 || open >= len(s) || s[open] != '{' {
		return -1
	}
	depth := 0
	inString := false
	escaped := false
	for i := open; i < len(s); i++ {
		ch := s[i]
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == '"' {
				inString = false
			}
			continue
		}
		switch ch {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}

// CountMenuNodesFromDraft counts id-bearing nodes in a menu draft.
func CountMenuNodesFromDraft(draftText string) int {
	normalized := ExtractMenuDraftForCompletion(draftText)
	if normalized == "" {
		normalized = NormalizeMenuDraftJson(draftText)
	}
	if normalized == "" {
		return 0
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(normalized), &parsed); err != nil {
		return 0
	}
	menu, _ := parsed["menu"].([]any)
	return countMenuNodesRecursive(menu)
}

func countMenuNodesRecursive(nodes []any) int {
	n := 0
	for _, item := range nodes {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if id, _ := m["id"].(string); strings.TrimSpace(id) != "" {
			n++
		}
		if children, ok := m["children"].([]any); ok {
			n += countMenuNodesRecursive(children)
		}
	}
	return n
}

// IsEffectivelyEmptyMenuEditor reports greenfield editor state.
func IsEffectivelyEmptyMenuEditor(editor string) bool {
	s := strings.TrimSpace(editor)
	if s == "" || s == `{"menu":[]}` || s == `{"menu": []}` {
		return true
	}
	return CountMenuNodesFromDraft(s) <= 0
}

// NormalizeMenuToArray extracts bare menu array JSON from various shapes.
func NormalizeMenuToArray(jsonText string) ([]any, error) {
	raw := strings.TrimSpace(jsonText)
	if raw == "" {
		return []any{}, nil
	}
	var parsed any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil, err
	}
	switch v := parsed.(type) {
	case []any:
		return v, nil
	case map[string]any:
		for _, key := range []string{"menu", "menus", "data", "result"} {
			if key == "data" {
				if data, ok := v["data"].(map[string]any); ok {
					if menu, ok := data["menu"].([]any); ok {
						return menu, nil
					}
				}
				continue
			}
			if arr, ok := v[key].([]any); ok {
				return arr, nil
			}
		}
		if isLikelyMenuNodeMap(v) {
			return []any{v}, nil
		}
	}
	return []any{}, nil
}
