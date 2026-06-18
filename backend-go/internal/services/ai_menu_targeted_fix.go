package services

import (
	"encoding/json"
	"strings"

	"csm_server/backend-go/internal/config"
)

// MenuTableFieldIssue is one concrete table column that needs a surgical fix.
type MenuTableFieldIssue struct {
	MenuNodeID  string
	FieldNodeID string
	FName       string
	TableName   string
	IssueCodes  []string
	FieldJSON   string
}

// IsMenuTableFieldI18nComboRequest detects user intent to fix column headers / combo co values.
func IsMenuTableFieldI18nComboRequest(message string) bool {
	lower := strings.ToLower(strings.TrimSpace(message))
	if lower == "" {
		return false
	}
	hits := 0
	for _, kw := range []string{
		"cột", "cot", "column", "f_header", "f_types", "combo", "co ", "coro",
		"tiếng việt", "tieng viet", "vietnamese", "ngôn ngữ", "ngon ngu",
		"f_cbo_query", "f_cbo_list", "không có giá trị", "khong co gia tri",
		"hiện tiếng anh", "hien tieng anh", "english",
	} {
		if strings.Contains(lower, kw) {
			hits++
		}
	}
	return hits >= 2
}

func tableFieldNodeID(menuNodeID, fName string, row map[string]any) string {
	if id := strings.TrimSpace(stringFromAny(row["id"])); id != "" {
		return id
	}
	menuNodeID = strings.TrimSpace(menuNodeID)
	fName = strings.TrimSpace(fName)
	if menuNodeID != "" && fName != "" {
		return menuNodeID + "@@@@@" + fName
	}
	return fName
}

func isComboFieldType(ft string) bool {
	ft = strings.ToLower(strings.TrimSpace(ft))
	return ft == "co" || ft == "coro" || ft == "cbo"
}

func isBlankFieldValue(v any) bool {
	return strings.TrimSpace(stringFromAny(v)) == ""
}

// AnalyzeMenuTableFieldIssues scans menu JSON and lists fields needing targeted fixes.
func AnalyzeMenuTableFieldIssues(menuJSON string) []MenuTableFieldIssue {
	menuJSON = CoerceMenuEditorPayload(menuJSON)
	if menuJSON == "" {
		return nil
	}
	var root any
	if err := json.Unmarshal([]byte(menuJSON), &root); err != nil {
		return nil
	}
	menuList, _ := menuListFromRoot(root)
	if len(menuList) == 0 {
		return nil
	}
	var issues []MenuTableFieldIssue
	var walk func([]any)
	walk = func(nodes []any) {
		for _, item := range nodes {
			node, ok := item.(map[string]any)
			if !ok {
				continue
			}
			menuID := strings.TrimSpace(menuNodeIdentifier(node))
			tableName := strings.TrimSpace(stringFromAny(node["table_name"]))
			if table, ok := node["table"].([]any); ok {
				for _, col := range table {
					row, ok := col.(map[string]any)
					if !ok {
						continue
					}
					fname := strings.TrimSpace(stringFromAny(row["f_name"]))
					if fname == "" {
						continue
					}
					var codes []string
					hdr := strings.TrimSpace(stringFromAny(row["f_header"]))
					hdrVi := strings.TrimSpace(stringFromAny(row["f_header_vi"]))
					hdrEn := strings.TrimSpace(stringFromAny(row["f_header_en"]))

					if hdrVi == "" {
						if containsVietnamese(hdr) {
							codes = append(codes, "missing_f_header_vi_from_header")
						} else if hdrEn != "" && (hdr == "" || hdr == hdrEn || !containsVietnamese(hdr)) {
							codes = append(codes, "missing_f_header_vi_shows_en")
						} else if hdr == "" {
							codes = append(codes, "missing_f_header_from_fname")
						}
					}
					if isComboFieldType(stringFromAny(row["f_types"])) {
						cbo := strings.TrimSpace(stringFromAny(row["f_cbo_query"]))
						list := strings.TrimSpace(stringFromAny(row["f_cbo_list"]))
						if cbo == "" && list == "" {
							codes = append(codes, "empty_f_cbo_query")
						}
					}
					if len(codes) == 0 {
						continue
					}
					fieldCopy := deepCopyMap(row)
					b, _ := json.MarshalIndent(fieldCopy, "", "  ")
					issues = append(issues, MenuTableFieldIssue{
						MenuNodeID:  menuID,
						FieldNodeID: tableFieldNodeID(menuID, fname, row),
						FName:       fname,
						TableName:   tableName,
						IssueCodes:  codes,
						FieldJSON:   string(b),
					})
				}
			}
			if children, ok := node["children"].([]any); ok {
				walk(children)
			}
		}
	}
	walk(menuList)
	return issues
}

// ApplyDeterministicMenuTableFieldFixes patches only safe i18n fields (f_header_vi from Vietnamese f_header).
func ApplyDeterministicMenuTableFieldFixes(menuJSON string) (merged string, remaining []MenuTableFieldIssue, fixed int) {
	menuJSON = strings.TrimSpace(SanitizeMenuEditorPayload(menuJSON))
	if fast := coerceMenuEditorPayloadFast(menuJSON); fast != "" {
		menuJSON = fast
	} else {
		menuJSON = CoerceMenuEditorPayload(menuJSON)
	}
	if menuJSON == "" {
		return "", nil, 0
	}
	var root any
	if err := json.Unmarshal([]byte(menuJSON), &root); err != nil {
		return "", AnalyzeMenuTableFieldIssues(menuJSON), 0
	}
	menuList, wrapped := menuListFromRoot(root)
	if menuList == nil {
		return "", nil, 0
	}
	var walk func([]any)
	walk = func(nodes []any) {
		for _, item := range nodes {
			node, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if table, ok := node["table"].([]any); ok {
				for i, col := range table {
					row, ok := col.(map[string]any)
					if !ok {
						continue
					}
					hdr := strings.TrimSpace(stringFromAny(row["f_header"]))
					hdrVi := strings.TrimSpace(stringFromAny(row["f_header_vi"]))
					hdrEn := strings.TrimSpace(stringFromAny(row["f_header_en"]))
					fname := strings.TrimSpace(stringFromAny(row["f_name"]))
					if hdrVi == "" && containsVietnamese(hdr) {
						row["f_header_vi"] = hdr
						table[i] = row
						fixed++
					} else if hdrVi == "" && hdrEn != "" && (hdr == "" || hdr == hdrEn || !containsVietnamese(hdr)) {
						vi := humanizeFieldName(fname)
						if vi != "" {
							if hdr == "" || hdr == hdrEn {
								row["f_header"] = vi
							}
							row["f_header_vi"] = vi
							table[i] = row
							fixed++
						}
					}
				}
				node["table"] = table
			}
			if children, ok := node["children"].([]any); ok {
				walk(children)
			}
		}
	}
	walk(menuList)
	merged = marshalParsedMenuJSONForSize(root, len(menuJSON))
	if merged == "" {
		merged = marshalMenuRoot(root, menuList, wrapped)
	}
	if len(merged) <= menuLargeFastPathChars {
		remaining = AnalyzeMenuTableFieldIssues(merged)
	}
	return merged, remaining, fixed
}

func planMenuFieldIssueSlices(message string, issues []MenuTableFieldIssue) []EditTaskSlice {
	if len(issues) == 0 {
		return nil
	}
	max := editTaskPlannerMaxSlices()
	objective := summarizeEditRequest(message)
	var slices []EditTaskSlice
	for i, issue := range issues {
		if i >= max {
			break
		}
		desc := objective + " — field " + issue.FName
		if issue.TableName != "" {
			desc += " (" + issue.TableName + ")"
		}
		desc += " [" + strings.Join(issue.IssueCodes, ", ") + "]"
		slices = append(slices, EditTaskSlice{
			Kind:      "menu_field",
			Objective: desc,
			Symbols:   []string{issue.FName, issue.FieldNodeID},
			FieldIssue: &issue,
		})
	}
	total := len(slices)
	for i := range slices {
		slices[i].Index = i + 1
		slices[i].Total = total
	}
	return slices
}

func buildMenuFieldIssueFixPrompt(
	cfg config.AppConfig,
	req *CodeStreamRequest,
	issue MenuTableFieldIssue,
	workingMenu string,
) string {
	var sb strings.Builder
	sb.WriteString(baseSystemMin)
	sb.WriteString("\n\n")
	sb.WriteString(buildPromptLanguageBlock(req.UILang, req.Message))
	sb.WriteString(`[TARGETED_FIELD_PATCH_CONTRACT]
You fix EXACTLY ONE table column in an existing menu. Return ONLY JSON:
{"status":"success","patches":[{"action":"edit","nodeId":"` + issue.FieldNodeID + `","after":{...only changed keys...}}]}
OR {"textEdits":[{"id":"` + issue.FieldNodeID + `","f_name":"` + issue.FName + `",...}]}
Rules:
- Patch ONLY nodeId "` + issue.FieldNodeID + `" (field "` + issue.FName + `").
- NEVER return {"menu":[...]} full tree.
- NEVER add/delete menu nodes.
- For missing_f_header_vi: set f_header_vi to proper Vietnamese; keep f_header_en as English.
- For empty_f_cbo_query on f_types=co: add valid f_cbo_query JSON {"query":[...],"options":[]} using table_name context.
[/TARGETED_FIELD_PATCH_CONTRACT]

`)
	sb.WriteString("[ISSUE_CODES]\n")
	sb.WriteString(strings.Join(issue.IssueCodes, ", "))
	sb.WriteString("\n[/ISSUE_CODES]\n\n")
	sb.WriteString("[TARGET_FIELD]\n")
	sb.WriteString(issue.FieldJSON)
	sb.WriteString("\n[/TARGET_FIELD]\n\n")
	if issue.TableName != "" {
		sb.WriteString("[MENU_NODE table_name]\n")
		sb.WriteString(issue.TableName)
		sb.WriteString("\n[/MENU_NODE table_name]\n\n")
	}
	if workingMenu != "" {
		excerpt := extractMenuNodesMatchingSymbols(workingMenu, []string{issue.FName, issue.MenuNodeID})
		if excerpt != "" {
			sb.WriteString("[MENU_NODE_CONTEXT]\n")
			sb.WriteString(truncateStr(excerpt, editTaskPlannerSliceMaxChars()))
			sb.WriteString("\n[/MENU_NODE_CONTEXT]\n\n")
		}
	}
	sb.WriteString("[USER_REQUEST]\n")
	sb.WriteString(truncateStr(req.Message, 4000))
	sb.WriteString("\n[/USER_REQUEST]\n")
	cap := EffectiveLocalPromptCap(cfg, req.ContextType, "edit")
	return ClampPromptForLocalProvider(cfg, PrepareLocalProviderPrompt(sb.String(), cap), req.ContextType, "edit")
}
