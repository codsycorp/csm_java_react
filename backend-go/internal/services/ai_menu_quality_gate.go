package services

import (
	"strings"
)

// MenuQualityIssue is one validation finding.
type MenuQualityIssue struct {
	Severity string
	Rule     string
	Code     string
	Path     string
	Message  string
}

// MenuQualityReport is the output of validateMenuJson.
type MenuQualityReport struct {
	Issues      []MenuQualityIssue
	Score       float64
	ErrorCount  int
	WarningCount int
	NodeCount   int
	Passed      bool
}

// RepairMenuTreeInPlace applies deterministic repairs (labels, triggers, type_form).
func RepairMenuTreeInPlace(menu []any) int {
	repaired := 0
	var walk func(map[string]any)
	walk = func(node map[string]any) {
		if node == nil {
			return
		}
		if repairMenuNode(node) {
			repaired++
		}
		if children, ok := node["children"].([]any); ok {
			for _, c := range children {
				if m, ok := c.(map[string]any); ok {
					walk(m)
				}
			}
		}
	}
	for _, item := range menu {
		if m, ok := item.(map[string]any); ok {
			walk(m)
		}
	}
	return repaired
}

func repairMenuNode(node map[string]any) bool {
	changed := false
	label := stringFromAny(node["label"])
	if label != "" {
		if stringFromAny(node["label_en"]) == "" {
			node["label_en"] = label
			changed = true
		}
		if stringFromAny(node["label_zh"]) == "" {
			node["label_zh"] = label
			changed = true
		}
	}
	if node["type_form"] == nil {
		if tf := inferTypeForm(node); tf >= 0 {
			node["type_form"] = tf
			changed = true
		}
	}
	if icon := stringFromAny(node["icon"]); icon == "" && intFromAny(node["type_form"]) == 0 {
		node["icon"] = "folder"
		changed = true
	}
	for _, legacy := range []string{"m_icon", "menu_icon", "icon_name"} {
		if _, ok := node[legacy]; ok {
			delete(node, legacy)
			changed = true
		}
	}
	upgradeMinimalTriggers(node, intFromAny(node["type_form"]))
	if table, ok := node["table"].([]any); ok {
		for _, item := range table {
			f, ok := item.(map[string]any)
			if !ok {
				continue
			}
			hdr := stringFromAny(f["f_header"])
			if hdr != "" {
				if stringFromAny(f["f_header_en"]) == "" {
					f["f_header_en"] = hdr
					changed = true
				}
				if stringFromAny(f["f_header_zh"]) == "" {
					f["f_header_zh"] = hdr
					changed = true
				}
			}
			ft := stringFromAny(f["f_types"])
			if ft == "cbo" && stringFromAny(f["f_cbo_query"]) == "" {
				if opts, ok := f["f_options"].([]any); !ok || len(opts) == 0 {
					f["f_options"] = []map[string]string{{"value": "1", "label": hdr}}
					changed = true
				}
			}
		}
	}
	return changed
}

func inferTypeForm(node map[string]any) int {
	if _, ok := node["report_name"]; ok {
		return 5
	}
	if children, ok := node["children"].([]any); ok && len(children) > 0 {
		if intFromAny(node["type_form"]) == 0 {
			return 0
		}
	}
	if _, ok := node["table_name"]; ok {
		if intFromAny(node["type_form"]) == 2 {
			return 2
		}
		return 1
	}
	return 0
}

// ValidateMenuJSON runs hard quality gate (errorCount must be 0 to pass).
func ValidateMenuJSON(menu []any, _ string) MenuQualityReport {
	report := MenuQualityReport{Score: 100}
	if len(menu) == 0 {
		report.Issues = append(report.Issues, MenuQualityIssue{
			Severity: "error", Rule: "json_not_empty", Code: "ERR_JSON_INVALID",
			Path: "menu", Message: "Menu array is empty",
		})
		report.finalize()
		return report
	}
	byID := map[string]map[string]any{}
	var all []map[string]any
	var walk func(map[string]any, string, int)
	walk = func(node map[string]any, path string, depth int) {
		id := stringFromAny(node["id"])
		if id == "" {
			report.Issues = append(report.Issues, MenuQualityIssue{
				Severity: "error", Rule: "id_required", Code: "ERR_JSON_INVALID",
				Path: path, Message: "Node missing id",
			})
		} else if prev, dup := byID[id]; dup {
			_ = prev
			report.Issues = append(report.Issues, MenuQualityIssue{
				Severity: "error", Rule: "id_unique", Code: "ERR_JSON_INVALID",
				Path: "id=" + id, Message: "Duplicate menu id",
			})
		} else {
			byID[id] = node
		}
		if stringFromAny(node["label"]) == "" {
			report.Issues = append(report.Issues, MenuQualityIssue{
				Severity: "error", Rule: "label_required", Code: "ERR_LABEL_MISSING",
				Path: path, Message: "Missing label",
			})
		}
		typeForm := intFromAny(node["type_form"])
		if typeForm < 0 || typeForm > 6 {
			report.Issues = append(report.Issues, MenuQualityIssue{
				Severity: "warning", Rule: "type_form_range", Code: "WARN_TYPE_FORM",
				Path: path, Message: "type_form out of range",
			})
		}
		if typeForm == 1 || typeForm == 2 {
			validateTableSchema(node, path, &report)
			validateTriggerObject(node, path, &report)
		}
		all = append(all, node)
		if children, ok := node["children"].([]any); ok {
			for i, c := range children {
				if m, ok := c.(map[string]any); ok {
					walk(m, path+"/children["+itoa(i)+"]", depth+1)
				}
			}
		}
	}
	for i, item := range menu {
		if m, ok := item.(map[string]any); ok {
			walk(m, "menu["+itoa(i)+"]", 0)
		}
	}
	report.NodeCount = len(all)
	report.finalize()
	return report
}

func validateTableSchema(node map[string]any, path string, report *MenuQualityReport) {
	table, ok := node["table"].([]any)
	if !ok || len(table) == 0 {
		report.Issues = append(report.Issues, MenuQualityIssue{
			Severity: "warning", Rule: "table_present", Code: "WARN_TABLE_EMPTY",
			Path: path, Message: "table[] empty for form node",
		})
		return
	}
	for i, item := range table {
		f, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if stringFromAny(f["f_name"]) == "" {
			report.Issues = append(report.Issues, MenuQualityIssue{
				Severity: "error", Rule: "field_name", Code: "ERR_FIELD_INVALID",
				Path: path + "/table[" + itoa(i) + "]", Message: "Missing f_name",
			})
		}
		if stringFromAny(f["f_types"]) == "" {
			report.Issues = append(report.Issues, MenuQualityIssue{
				Severity: "error", Rule: "field_types", Code: "ERR_FIELD_INVALID",
				Path: path + "/table[" + itoa(i) + "]", Message: "Missing f_types",
			})
		}
	}
}

func validateTriggerObject(node map[string]any, path string, report *MenuQualityReport) {
	tr, ok := node["trigger"].(map[string]any)
	if !ok || len(tr) == 0 {
		report.Issues = append(report.Issues, MenuQualityIssue{
			Severity: "warning", Rule: "trigger_object", Code: "WARN_TRIGGER",
			Path: path, Message: "trigger should be object",
		})
		return
	}
	allowed := map[string]struct{}{
		"filter": {}, "load_db": {}, "update": {}, "beforeSave": {},
		"report_db": {}, "afterSave": {}, "delete": {},
	}
	for k := range tr {
		if _, ok := allowed[k]; !ok {
			report.Issues = append(report.Issues, MenuQualityIssue{
				Severity: "warning", Rule: "trigger_key", Code: "WARN_TRIGGER_KEY",
				Path: path, Message: "Unknown trigger key: " + k,
			})
		}
	}
}

func (r *MenuQualityReport) finalize() {
	for _, issue := range r.Issues {
		switch issue.Severity {
		case "error":
			r.ErrorCount++
		case "warning":
			r.WarningCount++
		}
	}
	r.Score = 100 - float64(r.ErrorCount)*12 - float64(r.WarningCount)*2.5
	if r.Score < 0 {
		r.Score = 0
	}
	r.Passed = r.ErrorCount == 0
}

// GateGreenfieldMenuForApply validates menu before editor apply (AD-R2).
func GateGreenfieldMenuForApply(menuJSON, requirement string) (MenuQualityReport, string) {
	roots := parseMenuRoots(menuJSON)
	RepairMenuTreeInPlace(roots)
	report := ValidateMenuJSON(roots, requirement)
	if report.Passed {
		return report, NormalizeMenuDraftJson(menuJSON)
	}
	// Retry once after repair
	RepairMenuTreeInPlace(roots)
	report = ValidateMenuJSON(roots, requirement)
	if report.Passed {
		return report, wrapMenuFromRoots(roots)
	}
	return report, ""
}

func wrapMenuFromRoots(roots []any) string {
	if len(roots) == 0 {
		return ""
	}
	return wrapMenuPayload(roots)
}

// MaybeApplyGreenfieldMenuScaffold replaces thin LLM output with scaffold when better.
func MaybeApplyGreenfieldMenuScaffold(menuJSON, userMessage string, spec BusinessSpec) string {
	if !IsComprehensiveGreenfieldMenuRequest(userMessage) {
		return menuJSON
	}
	inNodes := CountMenuNodesFromDraft(menuJSON)
	if inNodes >= greenfieldScaffoldMinNodes && len(menuJSON) >= 8000 {
		return menuJSON
	}
	scaffold := BuildGreenfieldMenuScaffoldJson(spec, userMessage)
	scaffoldNodes := CountMenuNodesFromDraft(scaffold)
	if scaffold == "" || scaffoldNodes <= inNodes {
		return menuJSON
	}
	return scaffold
}

// FinalOutputGateSSE builds final_output_gate event.
func FinalOutputGateSSE(req *CodeStreamRequest, report MenuQualityReport, gateType string) map[string]any {
	status := "passed"
	reason := "gate_ok"
	if !report.Passed {
		status = "rejected"
		reason = "quality_gate_failed"
	}
	return map[string]any{
		"stage": "final_output_gate", "status": status, "requestId": req.RequestID,
		"gateType": gateType, "reasonCode": reason,
		"score": report.Score, "errorCount": report.ErrorCount, "warningCount": report.WarningCount,
		"nodeCount": report.NodeCount, "passed": report.Passed,
		"message": gateMessage(report, gateType),
	}
}

func gateMessage(report MenuQualityReport, gateType string) string {
	if report.Passed {
		return "Quality gate passed (" + gateType + ")"
	}
	var msgs []string
	for _, issue := range report.Issues {
		if issue.Severity == "error" && len(msgs) < 3 {
			msgs = append(msgs, issue.Message)
		}
	}
	if len(msgs) == 0 {
		return "Quality gate failed"
	}
	return strings.Join(msgs, "; ")
}
