package services

import (
	"encoding/json"
	"strings"
	"unicode"
)

var comboLikeFieldTypes = map[string]struct{}{
	"co": {}, "coro": {}, "cbo": {}, "co_ro": {},
}

// IsBroadMenuAuditRequest mirrors Java isBroadMenuAuditRequest for deterministic menu audit.
func IsBroadMenuAuditRequest(message string) bool {
	lower := strings.ToLower(strings.TrimSpace(message))
	if lower == "" {
		return false
	}
	mentionsTrigger := strings.Contains(lower, "trigger")
	mentionsLabel := strings.Contains(lower, "label") ||
		strings.Contains(lower, "nhãn") || strings.Contains(lower, "nhan") ||
		strings.Contains(lower, "ngôn ngữ") || strings.Contains(lower, "ngon ngu") ||
		strings.Contains(lower, "3 ngôn") || strings.Contains(lower, "ba ngôn")
	mentionsInputParams := strings.Contains(lower, "tham số") || strings.Contains(lower, "tham so") ||
		strings.Contains(lower, "đầu vào") || strings.Contains(lower, "dau vao") ||
		strings.Contains(lower, "parameter") || strings.Contains(lower, "input") ||
		strings.Contains(lower, "cột") || strings.Contains(lower, "cot") ||
		strings.Contains(lower, "f_header") || strings.Contains(lower, "f_types") ||
		strings.Contains(lower, "f_cbo")
	mentionsAudit := strings.Contains(lower, "kiểm tra") || strings.Contains(lower, "kiem tra") ||
		strings.Contains(lower, "check") || strings.Contains(lower, "đúng chuẩn") ||
		strings.Contains(lower, "dung chuan") || strings.Contains(lower, "đầy đủ") ||
		strings.Contains(lower, "day du") || strings.Contains(lower, "sửa") ||
		strings.Contains(lower, "sua") || strings.Contains(lower, "fix") ||
		strings.Contains(lower, "xem kỹ") || strings.Contains(lower, "xem ky")
	mentionsMenuScope := strings.Contains(lower, "menu") ||
		strings.Contains(lower, "từng menu") || strings.Contains(lower, "tung menu") ||
		strings.Contains(lower, "bảng") || strings.Contains(lower, "bang") ||
		strings.Contains(lower, "table") || strings.Contains(lower, "cột")
	if mentionsInputParams && mentionsAudit {
		return true
	}
	return mentionsMenuScope && mentionsAudit && (mentionsTrigger || mentionsLabel || mentionsInputParams)
}

// BuildRepairPatchEnvelope builds deterministic quality-gate patches (Java MenuQualityGateService parity).
func BuildRepairPatchEnvelope(menuJSON string, maxPatches int) string {
	menuJSON = CoerceMenuEditorPayload(menuJSON)
	if menuJSON == "" || maxPatches <= 0 {
		return ""
	}
	var root any
	if err := json.Unmarshal([]byte(menuJSON), &root); err != nil {
		return ""
	}
	menuList, wrapped := menuListFromRoot(root)
	if len(menuList) == 0 {
		return ""
	}

	var patches []map[string]any
	var walk func([]any)
	walk = func(nodes []any) {
		for _, item := range nodes {
			node, ok := item.(map[string]any)
			if !ok {
				continue
			}
			nodeID := menuNodeIdentifier(node)
			if nodeID == "" {
				continue
			}
			after := map[string]any{}
			accumulateLabelI18nRepairs(node, after)
			accumulateTableInputParamRepairs(node, after)
			if len(after) > 0 {
				patches = append(patches, map[string]any{
					"action": "edit",
					"nodeId": nodeID,
					"after":  after,
				})
			}
			if children, ok := node["children"].([]any); ok {
				walk(children)
			}
		}
	}
	walk(menuList)
	if len(patches) == 0 {
		return ""
	}
	if len(patches) > maxPatches {
		patches = patches[:maxPatches]
	}
	envelope := map[string]any{
		"status":   "success",
		"patches":  patches,
		"warnings": []string{},
	}
	b, err := json.Marshal(envelope)
	if err != nil {
		return ""
	}
	_ = wrapped
	return string(b)
}

// TrySalvageMenuEditViaQualityGate returns a patch envelope for deterministic menu repairs.
func TrySalvageMenuEditViaQualityGate(menuJSON string, maxPatches int) string {
	return BuildRepairPatchEnvelope(menuJSON, maxPatches)
}

// RunMenuQualityGateEarlyAudit merges deterministic patches into editor base (Java prepareBroadMenuQualityGateAudit).
func RunMenuQualityGateEarlyAudit(editorBase string, maxPatches int) (merged string, patchEnvelope string, preview MenuCompletionPreview, ok bool) {
	editorBase = strings.TrimSpace(SanitizeMenuEditorPayload(editorBase))
	if editorBase == "" {
		return "", "", MenuCompletionPreview{}, false
	}
	// Large menus: in-place walk avoids patch envelope + DiffMergeTrees on full tree.
	if len(editorBase) > menuLargeFastPathChars {
		if merged, fixed, changed := ApplyMenuQualityGateInPlace(editorBase); changed && merged != "" {
			preview = MenuCompletionPreview{
				MergedResponse: merged,
				Edited:         maxInt(fixed, 1),
			}
			return merged, "", preview, true
		}
		return "", "", MenuCompletionPreview{}, false
	}
	editorBase = CoerceMenuEditorPayload(editorBase)
	if editorBase == "" {
		return "", "", MenuCompletionPreview{}, false
	}
	envelope := TrySalvageMenuEditViaQualityGate(editorBase, maxPatches)
	if envelope == "" {
		return "", "", MenuCompletionPreview{}, false
	}
	preview = BuildMenuCompletionMergePreview(editorBase, envelope)
	if preview.MergedResponse == "" {
		return "", envelope, preview, false
	}
	return preview.MergedResponse, envelope, preview, true
}

// ApplyMenuQualityGateInPlace applies deterministic label/table i18n repairs without patch envelope roundtrip.
func ApplyMenuQualityGateInPlace(menuJSON string) (merged string, fixed int, changed bool) {
	menuJSON = strings.TrimSpace(SanitizeMenuEditorPayload(menuJSON))
	if menuJSON == "" {
		return "", 0, false
	}
	var root any
	if err := json.Unmarshal([]byte(menuJSON), &root); err != nil {
		return "", 0, false
	}
	menuList, _ := menuListFromRoot(root)
	if len(menuList) == 0 {
		return "", 0, false
	}
	var walk func([]any)
	walk = func(nodes []any) {
		for _, item := range nodes {
			node, ok := item.(map[string]any)
			if !ok {
				continue
			}
			fixed += applyLabelI18nRepairsInPlace(node)
			fixed += applyTableInputParamRepairsInPlace(node)
			if children, ok := node["children"].([]any); ok {
				walk(children)
			}
		}
	}
	walk(menuList)
	if fixed == 0 {
		return menuJSON, 0, false
	}
	return marshalParsedMenuJSONForSize(root, len(menuJSON)), fixed, true
}

func applyLabelI18nRepairsInPlace(node map[string]any) int {
	fixed := 0
	label := strings.TrimSpace(stringFromAny(node["label"]))
	if label == "" {
		return 0
	}
	if strings.TrimSpace(stringFromAny(node["label_en"])) == "" {
		node["label_en"] = label
		fixed++
	}
	if strings.TrimSpace(stringFromAny(node["label_zh"])) == "" {
		node["label_zh"] = label
		fixed++
	}
	return fixed
}

func applyTableInputParamRepairsInPlace(node map[string]any) int {
	table, ok := node["table"].([]any)
	if !ok || len(table) == 0 {
		return 0
	}
	fixed := 0
	for i, col := range table {
		row, ok := col.(map[string]any)
		if !ok {
			continue
		}
		fName := strings.TrimSpace(stringFromAny(row["f_name"]))
		if fName == "" {
			continue
		}
		rowFixed := false

		fHeader := strings.TrimSpace(stringFromAny(row["f_header"]))
		fHeaderEn := strings.TrimSpace(stringFromAny(row["f_header_en"]))
		fHeaderVi := strings.TrimSpace(stringFromAny(row["f_header_vi"]))

		if fHeader == "" {
			fHeader = humanizeFieldName(fName)
			if fHeader != "" {
				row["f_header"] = fHeader
				rowFixed = true
			}
		}
		if fHeaderVi == "" {
			if containsVietnamese(fHeader) {
				row["f_header_vi"] = fHeader
				rowFixed = true
			} else if fHeaderEn != "" && (fHeader == "" || fHeader == fHeaderEn || !containsVietnamese(fHeader)) {
				vi := humanizeFieldName(fName)
				if vi != "" {
					if fHeader == "" || fHeader == fHeaderEn {
						row["f_header"] = vi
					}
					row["f_header_vi"] = vi
					rowFixed = true
				}
			} else if fHeader != "" {
				row["f_header_vi"] = fHeader
				rowFixed = true
			}
		}
		if fHeaderEn == "" && fHeader != "" {
			row["f_header_en"] = fHeaderEnOrFallback(fHeader, fName)
			rowFixed = true
		}
		if strings.TrimSpace(stringFromAny(row["f_header_zh"])) == "" && fHeader != "" {
			row["f_header_zh"] = fHeader
			rowFixed = true
		}
		if rowFixed {
			table[i] = row
			fixed++
		}
	}
	if fixed > 0 {
		node["table"] = table
	}
	return fixed
}

func accumulateLabelI18nRepairs(node map[string]any, after map[string]any) {
	label := strings.TrimSpace(stringFromAny(node["label"]))
	if label == "" {
		return
	}
	if strings.TrimSpace(stringFromAny(node["label_en"])) == "" {
		after["label_en"] = label
	}
	if strings.TrimSpace(stringFromAny(node["label_zh"])) == "" {
		after["label_zh"] = label
	}
}

func accumulateTableInputParamRepairs(node map[string]any, after map[string]any) {
	table, ok := node["table"].([]any)
	if !ok || len(table) == 0 {
		return
	}
	var fieldPatches []map[string]any
	for _, col := range table {
		row, ok := col.(map[string]any)
		if !ok {
			continue
		}
		fName := strings.TrimSpace(stringFromAny(row["f_name"]))
		if fName == "" {
			continue
		}
		patch := map[string]any{"f_name": fName}

		fHeader := strings.TrimSpace(stringFromAny(row["f_header"]))
		fHeaderEn := strings.TrimSpace(stringFromAny(row["f_header_en"]))
		fHeaderVi := strings.TrimSpace(stringFromAny(row["f_header_vi"]))

		if fHeader == "" {
			fHeader = humanizeFieldName(fName)
			if fHeader != "" {
				patch["f_header"] = fHeader
			}
		}
		// Vietnamese runtime reads f_header_vi first — align with Java f_header (VI) + grid i18n.
		if fHeaderVi == "" {
			if containsVietnamese(fHeader) {
				patch["f_header_vi"] = fHeader
			} else if fHeaderEn != "" && (fHeader == "" || fHeader == fHeaderEn || !containsVietnamese(fHeader)) {
				vi := humanizeFieldName(fName)
				if vi != "" {
					if fHeader == "" || fHeader == fHeaderEn {
						patch["f_header"] = vi
					}
					patch["f_header_vi"] = vi
				}
			} else if fHeader != "" {
				patch["f_header_vi"] = fHeader
			}
		}
		if fHeaderEn == "" && fHeader != "" {
			patch["f_header_en"] = fHeaderEnOrFallback(fHeader, fName)
		}
		if strings.TrimSpace(stringFromAny(row["f_header_zh"])) == "" && fHeader != "" {
			patch["f_header_zh"] = fHeader
		}

		ft := strings.ToLower(strings.TrimSpace(stringFromAny(row["f_types"])))
		if _, isCombo := comboLikeFieldTypes[ft]; isCombo {
			// Java does not invent f_cbo_query — only flags in quality report.
			_ = row
		}

		if len(patch) > 1 {
			fieldPatches = append(fieldPatches, patch)
		}
	}
	if len(fieldPatches) > 0 {
		after["table"] = fieldPatches
	}
}

func fHeaderEnOrFallback(fHeader, fName string) string {
	if containsVietnamese(fHeader) {
		return fHeader
	}
	return humanizeFieldName(fName)
}

func humanizeFieldName(fName string) string {
	fName = strings.TrimSpace(fName)
	if fName == "" {
		return ""
	}
	parts := strings.Fields(strings.ReplaceAll(fName, "_", " "))
	for i, p := range parts {
		if p == "" {
			continue
		}
		runes := []rune(strings.ToLower(p))
		if len(runes) > 0 {
			runes[0] = unicode.ToUpper(runes[0])
		}
		parts[i] = string(runes)
	}
	out := strings.Join(parts, " ")
	switch strings.ToLower(fName) {
	case "dvt", "donvitinh":
		return "ĐVT"
	case "stt":
		return "STT"
	case "ma", "code":
		return "Mã"
	case "ten", "name":
		return "Tên"
	}
	return out
}
