package services

import (
	"encoding/json"
	"os"
	"strconv"
	"strings"

	"csm_server/backend-go/internal/config"
)

// EditTaskSlice is one focused region for incremental edit (Java AiEditTaskPlannerService parity).
type EditTaskSlice struct {
	Index          int
	Total          int
	Kind           string
	Objective      string
	LineStart      int
	LineEnd        int
	Symbols        []string
	ExcerptPreview string
	FieldIssue     *MenuTableFieldIssue
}

// EditTaskPlan decomposes a user request into ordered execution slices.
type EditTaskPlan struct {
	Enabled              bool
	RequestSummary       string
	FlowType             string
	ResponseMode         string
	TargetSymbols        []string
	Slices               []EditTaskSlice
	MultiSliceExecution  bool
	SourceChars          int
}

func editTaskPlannerEnabled() bool {
	v := strings.TrimSpace(os.Getenv("AI_LOCAL_EDIT_TASK_PLANNER_ENABLED"))
	if v == "" {
		return true
	}
	switch strings.ToLower(v) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func editTaskPlannerMaxSlices() int {
	if v := strings.TrimSpace(os.Getenv("AI_LOCAL_EDIT_TASK_PLANNER_MAX_SLICES")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 6
}

func editTaskPlannerSliceContextLines() int {
	if v := strings.TrimSpace(os.Getenv("AI_LOCAL_EDIT_TASK_PLANNER_SLICE_CONTEXT_LINES")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 20 {
			return n
		}
	}
	return 80
}

func editTaskPlannerSliceMaxChars() int {
	if v := strings.TrimSpace(os.Getenv("AI_LOCAL_EDIT_TASK_PLANNER_SLICE_MAX_CHARS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 2000 {
			return n
		}
	}
	if IsPromptBudgetDisabled() {
		return 24_000
	}
	cfg := config.AppConfig{}
	if !IsConstrained8GbTier(cfg) {
		return 24_000
	}
	return 8000
}

// PlanEditTask builds slice decomposition for menu/code incremental edit.
func PlanEditTask(req *CodeStreamRequest, responseMode string) EditTaskPlan {
	if !editTaskPlannerEnabled() || req == nil {
		return EditTaskPlan{Enabled: false}
	}
	code := CoerceMenuEditorPayload(req.FullCurrentCode)
	if code == "" {
		code = CoerceMenuEditorPayload(req.CurrentCode)
	}
	msg := strings.TrimSpace(req.Message)
	mode := strings.ToLower(strings.TrimSpace(responseMode))
	if mode == "" {
		mode = "edit"
	}
	menuFlow := isMenuJSONContext(req.ContextType)
	flowType := "FRONTEND_CODE"
	if menuFlow {
		flowType = "MENU_JSON"
	}

	symbols := extractEditTargetSymbols(msg, code, menuFlow)
	var slices []EditTaskSlice
	if menuFlow {
		if IsMenuTableFieldI18nComboRequest(msg) {
			base := CoerceMenuEditorPayload(code)
			if merged, _, _ := ApplyDeterministicMenuTableFieldFixes(base); merged != "" {
				base = merged
			}
			if fieldSlices := planMenuFieldIssueSlices(msg, AnalyzeMenuTableFieldIssues(base)); len(fieldSlices) > 0 {
				slices = fieldSlices
			}
		}
		if len(slices) == 0 && !IsMenuTableFieldI18nComboRequest(msg) {
			slices = planMenuEditSlices(msg, code, symbols)
		}
	} else {
		slices = planCodeEditSlices(code, symbols)
	}

	multi := mode == "edit" && !menuFlow && len(code) >= 30_000 && len(slices) > 1
	return EditTaskPlan{
		Enabled:             len(slices) > 0,
		RequestSummary:      summarizeEditRequest(msg),
		FlowType:            flowType,
		ResponseMode:        mode,
		TargetSymbols:       symbols,
		Slices:              slices,
		MultiSliceExecution: multi,
		SourceChars:         len(code),
	}
}

func extractEditTargetSymbols(message, code string, menuFlow bool) []string {
	seen := map[string]bool{}
	var out []string
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" || len(s) < 2 || seen[s] {
			return
		}
		seen[s] = true
		out = append(out, s)
	}
	for _, m := range quotedTargetPattern.FindAllStringSubmatch(message, -1) {
		if len(m) > 1 {
			add(m[1])
		}
	}
	lower := strings.ToLower(message)
	for _, kw := range []string{
		"f_types", "f_cbo_query", "f_cbo_list", "f_header", "f_header_en", "f_header_zh",
		"combo", "co ", "coro", "tiếng việt", "tieng viet", "vietnamese", "english",
	} {
		if strings.Contains(lower, kw) {
			add(kw)
		}
	}
	if menuFlow {
		for _, token := range []string{"f_types", "f_cbo_query", "f_header", "table_name", "trigger"} {
			if strings.Contains(code, token) {
				add(token)
			}
		}
	}
	if len(out) > editTaskPlannerMaxSlices() {
		out = out[:editTaskPlannerMaxSlices()]
	}
	return out
}

func planMenuEditSlices(message, code string, symbols []string) []EditTaskSlice {
	objective := summarizeEditRequest(message)
	lineCount := countLines(code)
	maxSlices := editTaskPlannerMaxSlices()
	ctxLines := editTaskPlannerSliceContextLines()

	if len(symbols) == 0 {
		return []EditTaskSlice{{
			Index: 1, Total: 1, Kind: "menu_full", Objective: objective,
			LineStart: 1, LineEnd: lineCount, ExcerptPreview: truncateStr(code, 200),
		}}
	}

	var slices []EditTaskSlice
	idx := 0
	for _, sym := range symbols {
		if idx >= maxSlices {
			break
		}
		pos := strings.Index(code, sym)
		if pos < 0 {
			pos = strings.Index(strings.ToLower(code), strings.ToLower(sym))
		}
		if pos < 0 {
			continue
		}
		lineStart := estimateLineAt(code, pos)
		lineEnd := lineStart + max(40, ctxLines)
		if lineEnd > lineCount {
			lineEnd = lineCount
		}
		if lineStart > 10 {
			lineStart -= 10
		}
		idx++
		excerpt := extractLineSliceExcerpt(code, lineStart, lineEnd, editTaskPlannerSliceMaxChars())
		slices = append(slices, EditTaskSlice{
			Index: idx, Kind: "menu_node", Objective: objective + " — focus: " + sym,
			LineStart: lineStart, LineEnd: lineEnd, Symbols: []string{sym},
			ExcerptPreview: truncateStr(excerpt, 200),
		})
	}
	if len(slices) == 0 {
		return []EditTaskSlice{{
			Index: 1, Total: 1, Kind: "menu_full", Objective: objective,
			LineStart: 1, LineEnd: lineCount, Symbols: symbols,
			ExcerptPreview: truncateStr(code, 200),
		}}
	}
	total := len(slices)
	for i := range slices {
		slices[i].Total = total
		slices[i].Index = i + 1
	}
	return slices
}

func planCodeEditSlices(code string, symbols []string) []EditTaskSlice {
	lineCount := countLines(code)
	if len(symbols) == 0 {
		return []EditTaskSlice{{
			Index: 1, Total: 1, Kind: "code_full", Objective: "edit active code",
			LineStart: 1, LineEnd: lineCount,
		}}
	}
	maxSlices := editTaskPlannerMaxSlices()
	ctxLines := editTaskPlannerSliceContextLines()
	var slices []EditTaskSlice
	for i, sym := range symbols {
		if i >= maxSlices {
			break
		}
		pos := strings.Index(code, sym)
		if pos < 0 {
			continue
		}
		lineStart := max(1, estimateLineAt(code, pos)-10)
		lineEnd := min(lineCount, lineStart+ctxLines)
		slices = append(slices, EditTaskSlice{
			Index: i + 1, Total: min(maxSlices, len(symbols)), Kind: "code_region",
			Objective: "patch around " + sym, LineStart: lineStart, LineEnd: lineEnd, Symbols: []string{sym},
		})
	}
	if len(slices) == 0 {
		return []EditTaskSlice{{Index: 1, Total: 1, Kind: "code_full", LineStart: 1, LineEnd: lineCount}}
	}
	total := len(slices)
	for i := range slices {
		slices[i].Total = total
		slices[i].Index = i + 1
	}
	return slices
}

func summarizeEditRequest(message string) string {
	msg := strings.TrimSpace(message)
	if len(msg) > 160 {
		return msg[:160] + "…"
	}
	return msg
}

func countLines(s string) int {
	if s == "" {
		return 1
	}
	return strings.Count(s, "\n") + 1
}

func estimateLineAt(text string, charPos int) int {
	if charPos <= 0 {
		return 1
	}
	if charPos > len(text) {
		charPos = len(text)
	}
	return strings.Count(text[:charPos], "\n") + 1
}

func extractLineSliceExcerpt(code string, lineStart, lineEnd, maxChars int) string {
	lines := strings.Split(code, "\n")
	if lineStart < 1 {
		lineStart = 1
	}
	if lineEnd > len(lines) {
		lineEnd = len(lines)
	}
	if lineStart > lineEnd {
		lineStart = lineEnd
	}
	excerpt := strings.Join(lines[lineStart-1:lineEnd], "\n")
	return truncateStr(excerpt, maxChars)
}

// extractMenuNodesMatchingSymbols returns compact JSON snippets for nodes touching symbols.
func extractMenuNodesMatchingSymbols(menuJSON string, symbols []string) string {
	menuJSON = strings.TrimSpace(menuJSON)
	if menuJSON == "" || len(symbols) == 0 {
		return ""
	}
	lowerSyms := make([]string, 0, len(symbols))
	for _, s := range symbols {
		lowerSyms = append(lowerSyms, strings.ToLower(strings.TrimSpace(s)))
	}
	var hits []string
	_ = walkMenuJSONNodes(menuJSON, func(nodeSnippet string) bool {
		low := strings.ToLower(nodeSnippet)
		for _, sym := range lowerSyms {
			if sym != "" && strings.Contains(low, sym) {
				hits = append(hits, truncateStr(nodeSnippet, 4000))
				return len(hits) >= 3
			}
		}
		return len(hits) >= 3
	})
	if len(hits) == 0 {
		return ""
	}
	return strings.Join(hits, "\n---\n")
}

func walkMenuJSONNodes(menuJSON string, fn func(nodeSnippet string) bool) error {
	var root any
	if err := json.Unmarshal([]byte(menuJSON), &root); err != nil {
		return err
	}
	list, _ := menuListFromRoot(root)
	if list == nil {
		return nil
	}
	var walk func([]any) bool
	walk = func(nodes []any) bool {
		for _, item := range nodes {
			node, ok := item.(map[string]any)
			if !ok {
				continue
			}
			b, err := json.MarshalIndent(node, "", "  ")
			if err == nil && fn(string(b)) {
				return true
			}
			if children, ok := node["children"].([]any); ok && walk(children) {
				return true
			}
		}
		return false
	}
	walk(list)
	return nil
}
