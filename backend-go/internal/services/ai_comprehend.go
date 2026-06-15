package services

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

// BusinessSpec is Phase 1 Comprehend output (heuristic subset of Java BusinessSpec).
type BusinessSpec struct {
	DomainSummary           string
	ExistingBusinessSummary string
	Modules                 []string
	Tables                  []string
	Flows                   []string
	UserDelta               string
	Greenfield              bool
	PlannedStructure        []PlannedModuleRow
}

var (
	tableNameRe = regexp.MustCompile(`(?i)\b(?:bảng|bang|table)\s+([a-z_][a-z0-9_]*)`)
	moduleRe    = regexp.MustCompile(`(?i)\b(?:module|modul|mô-đun|menu)\s+([a-z0-9_\-]+)`)
)

// ComprehendBusinessHeuristic builds BusinessSpec without LLM (J.1b fast path).
func ComprehendBusinessHeuristic(req *CodeStreamRequest) BusinessSpec {
	msg := strings.TrimSpace(req.Message)
	lower := strings.ToLower(msg)
	spec := BusinessSpec{
		UserDelta:  truncateStr(msg, 600),
		Greenfield: req.ContextType == "menu_json" && IsEffectivelyEmptyMenuEditor(req.CurrentCode),
	}

	if req.ContextType == "menu_json" {
		modules := extractMenuModuleLabels(req.CurrentCode)
		if len(modules) == 0 {
			modules = extractModulesFromMessage(lower)
		}
		spec.Modules = uniqueStrings(modules, 24)
		if spec.Greenfield {
			spec.DomainSummary = "Greenfield menu — chưa có module trong editor."
			spec.ExistingBusinessSummary = "Editor menu trống — tạo cấu trúc mới từ yêu cầu người dùng."
		} else {
			n := len(spec.Modules)
			spec.DomainSummary = "Menu hiện có với " + itoa(n) + " module/node."
			spec.ExistingBusinessSummary = summarizeExistingModules(spec.Modules)
		}
	} else {
		spec.Modules = extractModulesFromMessage(lower)
		spec.Tables = extractTablesFromMessage(lower)
		spec.Flows = extractFlowsFromMessage(lower)
		if strings.TrimSpace(req.CurrentCode) != "" {
			spec.ExistingBusinessSummary = "Editor code có " + itoa(countCodeLines(req.CurrentCode)) + " dòng — scope anchor từ active editor."
		}
		spec.DomainSummary = "DynamicCode / frontend runtime context."
	}
	return spec
}

func summarizeExistingModules(modules []string) string {
	if len(modules) == 0 {
		return "Menu có sẵn nhưng chưa trích xuất được tên module."
	}
	preview := strings.Join(modules[:min(6, len(modules))], ", ")
	if len(modules) > 6 {
		preview += ", …"
	}
	return "Modules hiện có: " + preview
}

func extractMenuModuleLabels(editor string) []string {
	normalized := ExtractMenuDraftForCompletion(editor)
	if normalized == "" {
		normalized = NormalizeMenuDraftJson(editor)
	}
	if normalized == "" {
		return nil
	}
	var parsed map[string]any
	if json.Unmarshal([]byte(normalized), &parsed) != nil {
		return nil
	}
	menu, _ := parsed["menu"].([]any)
	return collectMenuLabels(menu, 32)
}

func collectMenuLabels(nodes []any, max int) []string {
	var out []string
	var walk func([]any)
	walk = func(items []any) {
		for _, item := range items {
			if len(out) >= max {
				return
			}
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			label := firstNonEmpty(
				stringFromAny(m["label"]),
				stringFromAny(m["title"]),
				stringFromAny(m["name"]),
				stringFromAny(m["id"]),
			)
			if label != "" {
				out = append(out, label)
			}
			if children, ok := m["children"].([]any); ok {
				walk(children)
			}
		}
	}
	walk(nodes)
	return out
}

func extractModulesFromMessage(lower string) []string {
	var out []string
	for _, m := range moduleRe.FindAllStringSubmatch(lower, -1) {
		if len(m) > 1 && m[1] != "" {
			out = append(out, m[1])
		}
	}
	for _, k := range []string{"bán hàng", "ban hang", "kho", "nhân sự", "nhan su", "crm", "báo giá", "bao gia", "sản xuất", "san xuat"} {
		if strings.Contains(lower, k) {
			out = append(out, k)
		}
	}
	return uniqueStrings(out, 16)
}

func extractTablesFromMessage(lower string) []string {
	var out []string
	for _, m := range tableNameRe.FindAllStringSubmatch(lower, -1) {
		if len(m) > 1 {
			out = append(out, m[1])
		}
	}
	for _, m := range regexp.MustCompile(`\bf_[a-z][a-z0-9_]*`).FindAllString(lower, -1) {
		out = append(out, m)
	}
	return uniqueStrings(out, 12)
}

func extractFlowsFromMessage(lower string) []string {
	var out []string
	for _, k := range []string{"workflow", "luồng", "luong", "quy trình", "quy trinh", "approval", "phê duyệt", "phe duyet"} {
		if strings.Contains(lower, k) {
			out = append(out, k)
		}
	}
	return uniqueStrings(out, 8)
}

func countCodeLines(code string) int {
	if code == "" {
		return 0
	}
	return len(strings.Split(code, "\n"))
}

func uniqueStrings(in []string, max int) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		key := strings.ToLower(s)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, s)
		if len(out) >= max {
			break
		}
	}
	return out
}

// BuildComprehendPromptBlock injects BusinessSpec into the LLM prompt.
func BuildComprehendPromptBlock(spec BusinessSpec) string {
	var sb strings.Builder
	sb.WriteString("[BUSINESS_COMPREHENSION]\n")
	if spec.DomainSummary != "" {
		sb.WriteString("domain_summary: ")
		sb.WriteString(spec.DomainSummary)
		sb.WriteByte('\n')
	}
	if spec.ExistingBusinessSummary != "" {
		sb.WriteString("existing_business_summary: ")
		sb.WriteString(spec.ExistingBusinessSummary)
		sb.WriteByte('\n')
	}
	if len(spec.Modules) > 0 {
		sb.WriteString("modules: ")
		sb.WriteString(strings.Join(spec.Modules, ", "))
		sb.WriteByte('\n')
	}
	if len(spec.Tables) > 0 {
		sb.WriteString("tables: ")
		sb.WriteString(strings.Join(spec.Tables, ", "))
		sb.WriteByte('\n')
	}
	if len(spec.Flows) > 0 {
		sb.WriteString("flows: ")
		sb.WriteString(strings.Join(spec.Flows, ", "))
		sb.WriteByte('\n')
	}
	if spec.UserDelta != "" {
		sb.WriteString("user_delta: ")
		sb.WriteString(spec.UserDelta)
		sb.WriteByte('\n')
	}
	if spec.Greenfield {
		sb.WriteString("greenfield: true\n")
	}
	sb.WriteString("[/BUSINESS_COMPREHENSION]\n\n")
	return sb.String()
}

// BusinessComprehendRunningSSE returns business_comprehend running event.
func BusinessComprehendRunningSSE(req *CodeStreamRequest) map[string]any {
	return map[string]any{
		"stage": "business_comprehend", "status": "running", "requestId": req.RequestID,
		"message": "Đang phân tích nghiệp vụ (Comprehend heuristic)…",
	}
}

// BusinessComprehendCompletedSSE returns business_comprehend completed event.
func BusinessComprehendCompletedSSE(req *CodeStreamRequest, spec BusinessSpec, learningChars, editorChars int) map[string]any {
	strategy := "heuristic_comprehend"
	if learningChars > 0 {
		strategy = "heuristic_comprehend+learning_memory"
	}
	return map[string]any{
		"stage":                   "business_comprehend",
		"status":                  "completed",
		"requestId":               req.RequestID,
		"modules":                 len(spec.Modules),
		"moduleList":              spec.Modules,
		"greenfield":              spec.Greenfield,
		"existingBusinessSummary": spec.ExistingBusinessSummary,
		"domainSummary":           spec.DomainSummary,
		"fullCodeChars":           editorChars,
		"retrievedContextChars":   learningChars,
		"contextStrategy":         strategy,
	}
}

// BusinessPlanSSE returns business_plan ready event.
func BusinessPlanSSE(req *CodeStreamRequest, stepCount int, spec BusinessSpec) map[string]any {
	return map[string]any{
		"stage": "business_plan", "status": "ready", "requestId": req.RequestID,
		"stepCount": stepCount, "targetSymbols": len(spec.Modules) + len(spec.Tables),
		"sliceCount": 1, "outputContract": req.ContextType,
		"operationScenario": map[bool]string{true: "greenfield", false: "incremental"}[spec.Greenfield],
	}
}

// AgentHandoffSSE builds agent_handoff event.
func AgentHandoffSSE(req *CodeStreamRequest, fromAgent, toAgent, action, detail string) map[string]any {
	return map[string]any{
		"stage": "agent_handoff", "status": "done", "requestId": req.RequestID,
		"fromAgent": fromAgent, "toAgent": toAgent, "action": action, "detail": detail,
	}
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
