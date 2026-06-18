package services

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

// MenuCompletionPreview is the merge result used for SSE completion assembly.
type MenuCompletionPreview struct {
	MergedResponse string
	PatchOps       []PatchOp
	Added          int
	Edited         int
	Deleted        int
}

// BuildMenuCompletionMergePreview merges AI output into editor base (Java parity).
func BuildMenuCompletionMergePreview(baseDraftRaw, aiDraftRaw string) MenuCompletionPreview {
	if patch := buildMenuPatchEnvelopeMergePreview(baseDraftRaw, aiDraftRaw); patch.MergedResponse != "" {
		return patch
	}

	out := MenuCompletionPreview{}
	normalizedAI := ExtractMenuDraftForCompletion(aiDraftRaw)
	if normalizedAI == "" {
		out.MergedResponse = strings.TrimSpace(aiDraftRaw)
		return out
	}
	out.MergedResponse = normalizedAI

	normalizedBase := ExtractMenuDraftForCompletion(baseDraftRaw)
	baseNodes := CountMenuNodesFromDraft(normalizedBase)
	if normalizedBase == "" {
		baseNodes = CountMenuNodesFromDraft(baseDraftRaw)
	}
	if normalizedBase == "" || baseNodes <= 0 {
		if MenuEditorBaseHealth(baseDraftRaw) == "truncated_or_invalid" {
			out.MergedResponse = ""
			return out
		}
		if MenuEditorBaseHealth(baseDraftRaw) == "patch_envelope" {
			out.MergedResponse = ""
			return out
		}
		added := CountMenuNodesFromDraft(normalizedAI)
		if added > 0 && baseNodes <= 0 {
			out.Added = added
		}
		if baseNodes <= 0 {
			return out
		}
		out.MergedResponse = ""
	}

	mergeOut, err := DiffMergeTrees(normalizedBase, normalizedAI)
	if err != nil || mergeOut == nil {
		return out
	}
	wrapped := map[string]any{"menu": mergeOut.MergedMenu}
	mergedBytes, err := json.MarshalIndent(wrapped, "", "  ")
	if err != nil {
		return out
	}
	merged := string(mergedBytes)
	sanitized := NormalizeMenuDraftJson(merged)
	out.PatchOps = mergeOut.PatchOps
	out.Added = mergeOut.Added
	out.Edited = mergeOut.Edited
	out.Deleted = mergeOut.Deleted

	sanitizedNodes := CountMenuNodesFromDraft(sanitized)
	minKeep := int(math.Ceil(float64(baseNodes) * 0.80))
	if baseNodes > 0 && sanitizedNodes < minKeep {
		out.MergedResponse = ""
		out.Added = 0
		out.Edited = 0
		out.Deleted = 0
		return out
	}
	if sanitized != "" && (baseNodes <= 0 || sanitizedNodes >= minKeep) {
		out.MergedResponse = sanitized
	} else if merged != "" {
		out.MergedResponse = merged
	}
	return out
}

func buildMenuPatchEnvelopeMergePreview(baseCode, rawResponse string) MenuCompletionPreview {
	source := strings.TrimSpace(baseCode)
	raw := cleanMarkdownFromJSON(strings.TrimSpace(rawResponse))
	if source == "" || raw == "" {
		return MenuCompletionPreview{}
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return MenuCompletionPreview{}
	}
	patches, ok := payload["patches"].([]any)
	if !ok || len(patches) == 0 {
		return MenuCompletionPreview{}
	}
	return buildMenuPatchListMergePreview(source, patches)
}

func buildMenuPatchListMergePreview(baseCode string, patchList []any) MenuCompletionPreview {
	source := strings.TrimSpace(baseCode)
	if source == "" || len(patchList) == 0 {
		return MenuCompletionPreview{}
	}

	var parsed any
	if err := json.Unmarshal([]byte(source), &parsed); err != nil {
		return MenuCompletionPreview{}
	}
	wrappedByMenu := false
	var menuList []any
	switch v := parsed.(type) {
	case map[string]any:
		if menu, ok := v["menu"].([]any); ok {
			menuList = deepCopyMenuList(menu)
			wrappedByMenu = true
		}
	case []any:
		menuList = deepCopyMenuList(v)
	}
	if menuList == nil {
		return MenuCompletionPreview{}
	}

	touched := false
	for _, patchObj := range patchList {
		patch, ok := patchObj.(map[string]any)
		if !ok {
			continue
		}
		if applyMenuPatchEntry(&menuList, patch) {
			touched = true
		}
	}
	if !touched {
		return MenuCompletionPreview{}
	}

	var mergedPayload string
	if wrappedByMenu {
		if m, ok := parsed.(map[string]any); ok {
			wrapped := deepCopyMap(m)
			wrapped["menu"] = menuList
			b, _ := json.MarshalIndent(wrapped, "", "  ")
			mergedPayload = string(b)
		}
	}
	if mergedPayload == "" {
		wrapped := map[string]any{"menu": menuList}
		b, _ := json.MarshalIndent(wrapped, "", "  ")
		mergedPayload = string(b)
	}

	inputNodes := CountMenuNodesFromDraft(source)
	outputNodes := countMenuNodesRecursive(menuList)
	if inputNodes > 0 && outputNodes < int(math.Ceil(float64(inputNodes)*0.80)) {
		return MenuCompletionPreview{}
	}

	stats := buildMenuPatchEnvelopeMergeStats(patchList)
	out := MenuCompletionPreview{
		MergedResponse: mergedPayload,
		Added:          stats.Added,
		Edited:         stats.Edited,
		Deleted:        stats.Deleted,
	}
	if mergeOut, err := DiffMergeTrees(source, mergedPayload); err == nil && mergeOut != nil {
		out.PatchOps = mergeOut.PatchOps
	}
	return out
}

func buildMenuPatchEnvelopeMergeStats(patchList []any) MenuCompletionPreview {
	stats := MenuCompletionPreview{}
	for _, p := range patchList {
		patch, ok := p.(map[string]any)
		if !ok {
			continue
		}
		action := normalizePatchAction(patch)
		switch action {
		case "add":
			stats.Added++
		case "delete":
			stats.Deleted++
		default:
			stats.Edited++
		}
	}
	return stats
}

func normalizePatchAction(patch map[string]any) string {
	action := strings.ToLower(strings.TrimSpace(fmt.Sprint(patch["action"])))
	if action == "" {
		action = strings.ToLower(strings.TrimSpace(fmt.Sprint(patch["op"])))
	}
	switch action {
	case "update":
		return "edit"
	case "create":
		return "add"
	case "remove":
		return "delete"
	}
	if action == "" {
		return "edit"
	}
	return action
}

func applyMenuPatchEntry(menuList *[]any, patch map[string]any) bool {
	if menuList == nil || len(*menuList) == 0 || len(patch) == 0 {
		return false
	}
	action := normalizePatchAction(patch)
	nodeID := strings.TrimSpace(fmt.Sprint(patch["nodeId"]))
	if nodeID == "" || nodeID == "<nil>" {
		nodeID = strings.TrimSpace(fmt.Sprint(patch["id"]))
	}
	if nodeID == "" || nodeID == "<nil>" {
		return false
	}

	fieldUpdates := extractPatchFieldUpdates(patch)
	if strings.Contains(nodeID, "@@@@@") {
		return applyMenuTableFieldPatchEntry(menuList, nodeID, fieldUpdates)
	}

	if action == "delete" {
		return removeMenuNodeByID(menuList, nodeID)
	}
	if action == "add" {
		newNode := deepCopyMap(fieldUpdates)
		if _, ok := newNode["id"]; !ok {
			newNode["id"] = nodeID
		}
		parentID := strings.TrimSpace(fmt.Sprint(patch["parentId"]))
		return insertMenuNodeUnderParent(menuList, parentID, newNode)
	}

	found := findMenuNodeByID(*menuList, nodeID)
	if found == nil {
		return false
	}
	if len(fieldUpdates) > 0 {
		for k, v := range fieldUpdates {
			if k == "table" {
				if patchTable, ok := v.([]any); ok {
					mergeMenuTableFieldsByName(found, patchTable)
					continue
				}
			}
			found[k] = v
		}
	}
	if rf, ok := patch["removeFields"].([]any); ok {
		for _, item := range rf {
			delete(found, fmt.Sprint(item))
		}
	}
	return true
}

func applyMenuTableFieldPatchEntry(menuList *[]any, compositeID string, updates map[string]any) bool {
	if menuList == nil || len(updates) == 0 {
		return false
	}
	parts := strings.SplitN(compositeID, "@@@@@", 2)
	if len(parts) != 2 {
		return false
	}
	menuNodeID := strings.TrimSpace(parts[0])
	fieldRef := strings.TrimSpace(parts[1])
	if menuNodeID == "" || fieldRef == "" {
		return false
	}
	return walkMenuNodes(*menuList, func(node map[string]any) bool {
		nodeID := strings.TrimSpace(stringFromAny(node["id"]))
		if nodeID != menuNodeID {
			return false
		}
		table, ok := node["table"].([]any)
		if !ok {
			return false
		}
		for i, item := range table {
			row, ok := item.(map[string]any)
			if !ok {
				continue
			}
			rowID := strings.TrimSpace(stringFromAny(row["id"]))
			rowName := strings.TrimSpace(stringFromAny(row["f_name"]))
			if rowID == compositeID || rowName == fieldRef || strings.HasSuffix(rowID, "@@@@@"+fieldRef) {
				for k, v := range updates {
					row[k] = v
				}
				table[i] = row
				node["table"] = table
				return true
			}
		}
		return false
	})
}

func extractPatchFieldUpdates(patch map[string]any) map[string]any {
	if after, ok := patch["after"].(map[string]any); ok {
		return deepCopyMap(after)
	}
	if p, ok := patch["patch"].(map[string]any); ok {
		return deepCopyMap(p)
	}
	skip := map[string]bool{
		"id": true, "nodeId": true, "action": true, "op": true,
		"parentId": true, "removeFields": true, "path": true,
		"before": true, "after": true, "reason": true, "patch": true,
	}
	out := map[string]any{}
	for k, v := range patch {
		if skip[k] {
			continue
		}
		out[k] = v
	}
	return out
}

func findMenuNodeByID(menuList []any, nodeID string) map[string]any {
	for _, item := range menuList {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if id, _ := m["id"].(string); strings.TrimSpace(id) == nodeID {
			return m
		}
		if children, ok := m["children"].([]any); ok {
			if found := findMenuNodeByID(children, nodeID); found != nil {
				return found
			}
		}
	}
	return nil
}

func removeMenuNodeByID(menuList *[]any, nodeID string) bool {
	for i, item := range *menuList {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if id, _ := m["id"].(string); strings.TrimSpace(id) == nodeID {
			*menuList = append((*menuList)[:i], (*menuList)[i+1:]...)
			return true
		}
		if children, ok := m["children"].([]any); ok {
			childCopy := children
			if removeMenuNodeByID(&childCopy, nodeID) {
				m["children"] = childCopy
				return true
			}
		}
	}
	return false
}

func insertMenuNodeUnderParent(menuList *[]any, parentID string, newNode map[string]any) bool {
	parentID = strings.TrimSpace(parentID)
	if parentID == "" {
		*menuList = append(*menuList, newNode)
		return true
	}
	parent := findMenuNodeByID(*menuList, parentID)
	if parent == nil {
		return false
	}
	children, _ := parent["children"].([]any)
	children = append(children, newNode)
	parent["children"] = children
	return true
}

// mergeMenuTableFieldsByName overlays patch table rows onto existing table by f_name (Java parity).
func mergeMenuTableFieldsByName(node map[string]any, patchTable []any) {
	if node == nil || len(patchTable) == 0 {
		return
	}
	byName := map[string]map[string]any{}
	if existing, ok := node["table"].([]any); ok {
		for _, item := range existing {
			row, ok := item.(map[string]any)
			if !ok {
				continue
			}
			fName := strings.TrimSpace(stringFromAny(row["f_name"]))
			if fName == "" {
				continue
			}
			byName[fName] = deepCopyMap(row)
		}
	}
	for _, item := range patchTable {
		patchRow, ok := item.(map[string]any)
		if !ok {
			continue
		}
		fName := strings.TrimSpace(stringFromAny(patchRow["f_name"]))
		if fName == "" {
			continue
		}
		target := byName[fName]
		if target == nil {
			target = map[string]any{}
			byName[fName] = target
		}
		target["f_name"] = fName
		for k, v := range patchRow {
			target[k] = v
		}
	}
	out := make([]any, 0, len(byName))
	for _, row := range byName {
		out = append(out, row)
	}
	node["table"] = out
}

func deepCopyMenuList(menu []any) []any {
	b, _ := json.Marshal(menu)
	var out []any
	_ = json.Unmarshal(b, &out)
	return out
}

// HandleMenuMergeAPI serves POST /ai/menu-merge.
func HandleMenuMergeAPI(params map[string]any) (map[string]any, error) {
	scenario := strings.TrimSpace(paramString(params, "scenario", "incremental_update"))
	oldJSON := paramString(params, "old_json", "[]")
	newJSON := paramString(params, "new_json", "[]")

	var out *MenuMergeOutput
	var err error
	if scenario == "property_edit" {
		out, err = MergeMenuNode(oldJSON, newJSON)
	} else {
		out, err = DiffMergeTrees(oldJSON, newJSON)
	}
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(out)
	var result map[string]any
	_ = json.Unmarshal(b, &result)
	return result, nil
}
