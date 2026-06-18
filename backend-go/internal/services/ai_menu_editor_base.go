package services

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"
)

var menuJSONTrailingCommaRE = regexp.MustCompile(`,(\s*[}\]])`)

// CoerceMenuEditorPayload returns the best parseable menu JSON extracted from editor text.
func CoerceMenuEditorPayload(raw string) string {
	s := SanitizeMenuEditorPayload(strings.TrimSpace(raw))
	if s == "" {
		return ""
	}
	candidates := []string{
		s,
		repairLooseMenuJSON(s),
		ExtractMenuDraftForCompletion(s),
		extractLikelyMenuJSONCandidate(s),
		extractJSONObjectCandidate(s),
	}
	seen := map[string]bool{}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" || seen[candidate] {
			continue
		}
		seen[candidate] = true
		if norm := NormalizeMenuDraftJson(candidate); norm != "" {
			return norm
		}
		if norm := NormalizeMenuDraftJson(repairLooseMenuJSON(candidate)); norm != "" {
			return norm
		}
	}
	return s
}

func repairLooseMenuJSON(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	return menuJSONTrailingCommaRE.ReplaceAllString(s, "$1")
}

func menuJSONLooksPhysicallyTruncated(s string) bool {
	if strings.Contains(s, "editor truncated for server payload budget") {
		return true
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	depth := 0
	inString := false
	escaped := false
	for i := 0; i < len(s); i++ {
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
		if ch == '"' {
			inString = true
			continue
		}
		if ch == '{' {
			depth++
		} else if ch == '}' {
			depth--
		}
	}
	return depth != 0
}

func menuEditorHasSubstantialMenuSignals(s string) bool {
	if len(s) < 300 {
		return false
	}
	lower := strings.ToLower(s)
	signals := []string{`"menu"`, `"table"`, `"f_name"`, `"children"`, `"f_types"`}
	hits := 0
	for _, sig := range signals {
		if strings.Contains(lower, sig) {
			hits++
		}
	}
	return hits >= 3
}

// menuNodeIDSet returns stable menu node ids from draft JSON.
func menuNodeIDSet(draft string) map[string]bool {
	normalized := ExtractMenuDraftForCompletion(draft)
	if normalized == "" {
		normalized = strings.TrimSpace(draft)
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(normalized), &parsed); err != nil {
		return nil
	}
	menu, _ := parsed["menu"].([]any)
	out := map[string]bool{}
	collectMenuNodeIDsRecursive(menu, out)
	return out
}

func collectMenuNodeIDsRecursive(nodes []any, out map[string]bool) {
	for _, item := range nodes {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if id := menuNodeIdentifier(m); id != "" {
			out[id] = true
		}
		if children, ok := m["children"].([]any); ok {
			collectMenuNodeIDsRecursive(children, out)
		}
	}
}

// menuFullDraftOverlapsBase requires full-menu AI drafts to reuse existing node ids.
func menuFullDraftOverlapsBase(originalBase, aiDraft string) bool {
	orig := menuNodeIDSet(originalBase)
	if len(orig) == 0 {
		return true
	}
	ai := menuNodeIDSet(aiDraft)
	if len(ai) == 0 {
		return false
	}
	overlap := 0
	for id := range ai {
		if orig[id] {
			overlap++
		}
	}
	return overlap > 0 && float64(overlap)/float64(len(ai)) >= 0.5
}

// SanitizeMenuEditorPayload removes truncation sentinels accidentally saved into editor JSON.
func SanitizeMenuEditorPayload(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return s
	}
	for _, marker := range []string{
		"/* ... editor truncated for server payload budget ... */",
		"\n/* ... editor truncated for server payload budget ... */\n",
	} {
		s = strings.ReplaceAll(s, marker, "")
	}
	return strings.TrimSpace(s)
}

func menuEditorHasTreeContent(editor string) bool {
	s := SanitizeMenuEditorPayload(editor)
	if s == "" {
		return false
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(s), &parsed); err != nil {
		return false
	}
	menu, ok := parsed["menu"].([]any)
	return ok && len(menu) > 0
}

func menuNodeIdentifier(m map[string]any) string {
	for _, key := range []string{"id", "menu_id"} {
		if v := strings.TrimSpace(stringFromAny(m[key])); v != "" {
			return v
		}
	}
	return ""
}

func MenuEditorBaseHealth(editor string) string {
	coerced := CoerceMenuEditorPayload(editor)
	raw := SanitizeMenuEditorPayload(editor)
	if coerced == "" || coerced == `{"menu":[]}` || coerced == `{"menu": []}` {
		if raw == "" || raw == `{"menu":[]}` || raw == `{"menu": []}` {
			return "empty"
		}
	}
	if IsMenuPatchEnvelopePayload(coerced) {
		return "patch_envelope"
	}
	if CountMenuNodesFromDraft(coerced) > 0 || menuEditorHasTreeContent(coerced) {
		return "ok"
	}
	if menuJSONLooksPhysicallyTruncated(raw) {
		return "truncated_or_invalid"
	}
	if menuEditorHasSubstantialMenuSignals(raw) {
		return "ok"
	}
	return "empty"
}

// ResolveMenuEditEditorBase picks the best menu JSON base for merge/retention checks.
func ResolveMenuEditEditorBase(req *CodeStreamRequest) string {
	if req == nil {
		return ""
	}
	rawFull := SanitizeMenuEditorPayload(req.FullCurrentCode)
	rawCur := SanitizeMenuEditorPayload(req.CurrentCode)
	full := CoerceMenuEditorPayload(req.FullCurrentCode)
	cur := CoerceMenuEditorPayload(req.CurrentCode)
	if full == "" {
		full = cur
		rawFull = rawCur
	}
	if cur == "" {
		return full
	}
	fullNodes := CountMenuNodesFromDraft(full)
	curNodes := CountMenuNodesFromDraft(cur)
	curHealth := MenuEditorBaseHealth(rawCur)
	fullHealth := MenuEditorBaseHealth(rawFull)

	if fullHealth == "ok" && (curHealth == "truncated_or_invalid" || curHealth == "patch_envelope" || curHealth == "empty") {
		return full
	}
	if fullNodes > curNodes {
		return full
	}
	if len(rawFull) > len(rawCur)+256 && fullNodes >= curNodes && fullHealth != "truncated_or_invalid" {
		return full
	}
	if curHealth == "ok" || curHealth == "empty" {
		if curNodes > 0 {
			return cur
		}
	}
	if fullHealth == "ok" {
		return full
	}
	if fullNodes >= curNodes && full != "" {
		return full
	}
	if cur != "" {
		return cur
	}
	return full
}

// MenuEditPassesNodeRetentionGuard ensures merged menu keeps most of the original tree.
func MenuEditPassesNodeRetentionGuard(originalBase, candidate string) bool {
	baseNodes := CountMenuNodesFromDraft(originalBase)
	if baseNodes <= 0 {
		return true
	}
	mergedNodes := CountMenuNodesFromDraft(candidate)
	if mergedNodes <= 0 {
		return false
	}
	minKeep := int(math.Ceil(float64(baseNodes) * 0.80))
	return mergedNodes >= minKeep
}

// IsLikelyHallucinatedGreenfieldMenu detects generic demo menus from small local models.
func IsLikelyHallucinatedGreenfieldMenu(draft string) bool {
	normalized := strings.ToLower(ExtractMenuDraftForCompletion(draft))
	if normalized == "" {
		return false
	}
	demoMarkers := []string{
		`"id": "root"`,
		`"id":"root"`,
		`"id": "category1"`,
		`"id":"category1"`,
		`"id": "product1"`,
		`"id":"product1"`,
		`"label": "danh mục 1"`,
		`"label":"danh mục 1"`,
		`"label_en": "category 1"`,
		`"label_en":"category 1"`,
	}
	hits := 0
	for _, m := range demoMarkers {
		if strings.Contains(normalized, m) {
			hits++
		}
	}
	return hits >= 2 && CountMenuNodesFromDraft(draft) <= 12
}

// SafeMergeIncrementalMenuEdit merges slice output without shrinking a non-empty editor base.
func SafeMergeIncrementalMenuEdit(originalBase, working, aiOutput string) string {
	orig := strings.TrimSpace(originalBase)
	work := strings.TrimSpace(working)
	ai := strings.TrimSpace(aiOutput)
	if ai == "" {
		return work
	}
	baseForWork := work
	if baseForWork == "" {
		baseForWork = orig
	}
	origNodes := CountMenuNodesFromDraft(orig)

	if strings.Contains(ai, `"patches"`) || strings.Contains(ai, `"textEdits"`) {
		merged := MergeIncrementalMenuEdit(baseForWork, ai)
		if merged == "" || merged == baseForWork {
			return work
		}
		if origNodes > 0 && !MenuEditPassesNodeRetentionGuard(orig, merged) {
			return work
		}
		return merged
	}

	if draft := ExtractMenuDraftForCompletion(ai); draft != "" {
		if IsLikelyHallucinatedGreenfieldMenu(draft) {
			return work
		}
		if origNodes > 0 && !menuFullDraftOverlapsBase(orig, draft) {
			return work
		}
	}

	merged := MergeIncrementalMenuEdit(baseForWork, ai)
	if merged == "" || merged == baseForWork {
		return work
	}
	if origNodes > 0 && !MenuEditPassesNodeRetentionGuard(orig, merged) {
		return work
	}
	return merged
}
