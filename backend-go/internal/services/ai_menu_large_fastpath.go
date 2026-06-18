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
	return marshalParsedMenuJSONOpts(parsed, false)
}

func marshalParsedMenuJSONCompact(parsed any) string {
	return marshalParsedMenuJSONOpts(parsed, true)
}

func marshalParsedMenuJSONForSize(parsed any, sourceLen int) string {
	if sourceLen > menuLargeFastPathChars {
		return marshalParsedMenuJSONCompact(parsed)
	}
	return marshalParsedMenuJSON(parsed)
}

func marshalParsedMenuJSONOpts(parsed any, compact bool) string {
	if parsed == nil {
		return ""
	}
	var b []byte
	var err error
	if compact {
		b, err = json.Marshal(parsed)
	} else {
		b, err = json.MarshalIndent(parsed, "", "  ")
	}
	if err != nil {
		return ""
	}
	return string(b)
}

func resolveMenuEditEditorBaseFast(req *CodeStreamRequest) string {
	if req == nil {
		return ""
	}
	rawFull := SanitizeMenuEditorPayload(req.FullCurrentCode)
	if len(rawFull) > menuLargeFastPathChars && menuJSONLooksLikeValidMenuRoot(rawFull) {
		return rawFull
	}
	rawCur := SanitizeMenuEditorPayload(req.CurrentCode)
	if rawFull == "" && len(rawCur) > menuLargeFastPathChars && menuJSONLooksLikeValidMenuRoot(rawCur) {
		return rawCur
	}
	return ""
}

func isLargeFullMenuDraft(raw string) bool {
	raw = strings.TrimSpace(raw)
	return len(raw) > menuLargeFastPathChars && menuJSONLooksLikeValidMenuRoot(raw) &&
		!strings.Contains(raw, `"patches"`)
}
