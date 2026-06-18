package services

import (
	"regexp"
	"strings"
)

var printImportFnBodyRe = regexp.MustCompile(`(?is)function\s*\([^)]*\)\s*\{([\s\S]*)\}\s*;?\s*$`)

// IsPrintTriggerBodyComplete checks trigger body can render a full HTML document.
func IsPrintTriggerBodyComplete(body string) bool {
	s := strings.TrimSpace(body)
	if s == "" {
		return false
	}
	lower := strings.ToLower(s)
	if !strings.Contains(lower, "return") {
		return false
	}
	if strings.Contains(lower, "</html>") {
		return true
	}
	return strings.Contains(lower, "builditemstablehtml") &&
		(strings.Contains(lower, "buildcompanyhdr") || strings.Contains(lower, "<!doctype"))
}

// ResolvePrintImportTriggerBody merges AI output with seed template for LineItemsPdfImport.
func ResolvePrintImportTriggerBody(base, aiOutput string) string {
	base = strings.TrimSpace(base)
	ai := strings.TrimSpace(CleanLocalModelOutput(aiOutput))

	if ai == "" {
		return base
	}

	if edits := parseTextEditsFromModelOutput(ai); len(edits) > 0 && base != "" {
		if merged := applyTextEditsToText(base, edits); IsPrintTriggerBodyComplete(merged) {
			return merged
		}
	}

	if extracted := extractPrintImportFunctionBody(ai); IsPrintTriggerBodyComplete(extracted) {
		return extracted
	}
	if IsPrintTriggerBodyComplete(ai) {
		return ai
	}

	// Model sometimes returns the full edited file — prefer longer complete-looking body.
	if base != "" && ai != base {
		if IsPrintTriggerBodyComplete(base) && !IsPrintTriggerBodyComplete(ai) {
			return base
		}
		if len(ai) >= len(base)/2 && IsPrintTriggerBodyComplete(ai) {
			return ai
		}
	}

	if IsPrintTriggerBodyComplete(base) {
		return base
	}
	return ai
}

func extractPrintImportFunctionBody(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return s
	}
	if m := printImportFnBodyRe.FindStringSubmatch(s); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return s
}

func applyTextEditsToText(baseText string, edits []TextEdit) string {
	if baseText == "" || len(edits) == 0 {
		return baseText
	}
	lines := strings.Split(baseText, "\n")
	sorted := append([]TextEdit(nil), edits...)
	for i := 0; i < len(sorted)-1; i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].StartLine > sorted[i].StartLine {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	for _, edit := range sorted {
		start := edit.StartLine
		end := edit.EndLine
		if start < 1 {
			start = 1
		}
		if end < start {
			end = start
		}
		startIdx := start - 1
		endIdx := end
		if startIdx > len(lines) {
			startIdx = len(lines)
		}
		if endIdx > len(lines) {
			endIdx = len(lines)
		}
		replLines := []string{}
		if strings.TrimSpace(edit.Replacement) != "" {
			replLines = strings.Split(edit.Replacement, "\n")
		}
		lines = append(append(lines[:startIdx], replLines...), lines[endIdx:]...)
	}
	return strings.Join(lines, "\n")
}
