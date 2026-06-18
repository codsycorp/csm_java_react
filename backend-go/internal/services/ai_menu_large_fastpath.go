package services

import (
	"encoding/json"
	"strings"
)

// menuLargeFastPathChars — above this size skip O(n²) brace extraction and DiffMergeTrees.
const menuLargeFastPathChars = 150_000

func menuJSONLooksLikeValidMenuRoot(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" || !json.Valid([]byte(s)) {
		return false
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(s), &parsed); err != nil {
		return false
	}
	_, ok := parsed["menu"]
	return ok
}

func countMenuNodesFromJSONFast(s string) (int, bool) {
	s = SanitizeMenuEditorPayload(strings.TrimSpace(s))
	if s == "" {
		return 0, true
	}
	var parsed any
	if err := json.Unmarshal([]byte(s), &parsed); err != nil {
		return 0, false
	}
	menuList, _ := menuListFromRoot(parsed)
	if menuList == nil {
		return 0, false
	}
	return countMenuNodesRecursive(menuList), true
}

func coerceMenuEditorPayloadFast(raw string) string {
	s := SanitizeMenuEditorPayload(strings.TrimSpace(raw))
	if s == "" {
		return ""
	}
	if len(s) <= menuLargeFastPathChars {
		return ""
	}
	if menuJSONLooksLikeValidMenuRoot(s) {
		return s
	}
	repaired := repairLooseMenuJSON(s)
	if repaired != s && menuJSONLooksLikeValidMenuRoot(repaired) {
		return repaired
	}
	return ""
}

func marshalParsedMenuJSON(parsed any) string {
	if parsed == nil {
		return ""
	}
	b, err := json.MarshalIndent(parsed, "", "  ")
	if err != nil {
		return ""
	}
	return string(b)
}
