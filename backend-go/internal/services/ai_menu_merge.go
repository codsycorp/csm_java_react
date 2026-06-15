package services

import (
	"encoding/json"
	"fmt"
	"strings"
)

type FieldDelta struct {
	FieldName string `json:"fieldName"`
	OldVal    any    `json:"oldVal"`
	NewVal    any    `json:"newVal"`
}

type PatchOp struct {
	Action        string       `json:"action"`
	NodeID        string       `json:"nodeId"`
	NodeName      string       `json:"nodeName"`
	NodePath      string       `json:"nodePath"`
	ChangedFields []FieldDelta `json:"changedFields"`
}

type MenuMergeOutput struct {
	MergedMenu []any     `json:"mergedMenu"`
	PatchOps   []PatchOp `json:"patchOps"`
	Added      int       `json:"added"`
	Edited     int       `json:"edited"`
	Deleted    int       `json:"deleted"`
}

var skipDiffFields = map[string]bool{
	"children": true, "_action": true, "_delete": true,
	"updated_at": true, "created_at": true, "app_id": true,
}

// DiffMergeTrees compares old vs new menu trees (base-preserving merge).
func DiffMergeTrees(oldJSON, newJSON string) (*MenuMergeOutput, error) {
	oldTree, err := NormalizeMenuToArray(oldJSON)
	if err != nil {
		return nil, err
	}
	newTree, err := NormalizeMenuToArray(newJSON)
	if err != nil {
		return nil, err
	}

	out := &MenuMergeOutput{PatchOps: []PatchOp{}}

	oldMap := map[string]map[string]any{}
	oldPaths := map[string]string{}
	flattenMenuTree(oldTree, oldMap, oldPaths, "")

	newMap := map[string]map[string]any{}
	newPaths := map[string]string{}
	flattenMenuTree(newTree, newMap, newPaths, "")

	for id, newNode := range newMap {
		if _, ok := oldMap[id]; !ok {
			out.PatchOps = append(out.PatchOps, PatchOp{
				Action: "add", NodeID: id, NodeName: menuNodeName(newNode),
				NodePath: newPaths[id], ChangedFields: []FieldDelta{},
			})
			out.Added++
		} else {
			delta := computeMenuFieldDelta(oldMap[id], newNode)
			if len(delta) > 0 {
				out.PatchOps = append(out.PatchOps, PatchOp{
					Action: "edit", NodeID: id, NodeName: menuNodeName(newNode),
					NodePath: newPaths[id], ChangedFields: delta,
				})
				out.Edited++
			}
		}
	}
	for id, oldNode := range oldMap {
		if _, ok := newMap[id]; !ok {
			out.PatchOps = append(out.PatchOps, PatchOp{
				Action: "delete", NodeID: id, NodeName: menuNodeName(oldNode),
				NodePath: oldPaths[id], ChangedFields: []FieldDelta{},
			})
			out.Deleted++
		}
	}

	merged := mergeTreePreservingBase(oldTree, newMap)
	out.MergedMenu = merged
	return out, nil
}

// MergeMenuNode field-level merge for a single node.
func MergeMenuNode(oldNodeJSON, newNodeJSON string) (*MenuMergeOutput, error) {
	oldNode, err := parseSingleMenuNode(oldNodeJSON)
	if err != nil {
		return nil, err
	}
	newNode, err := parseSingleMenuNode(newNodeJSON)
	if err != nil {
		return nil, err
	}
	preserve := map[string]bool{"id": true, "parentId": true, "parent_id": true, "menu_id": true, "children": true}
	merged := deepCopyMap(oldNode)
	var deltas []FieldDelta

	for k, newVal := range newNode {
		if preserve[k] {
			continue
		}
		oldVal := merged[k]
		if k == "table" {
			if oldArr, ok := oldVal.([]any); ok {
				if newArr, ok := newVal.([]any); ok {
					merged[k] = mergeTableArray(oldArr, newArr, &deltas, "table")
					continue
				}
			}
		}
		if !jsonEqual(oldVal, newVal) {
			deltas = append(deltas, FieldDelta{FieldName: k, OldVal: scalarText(oldVal), NewVal: scalarText(newVal)})
			merged[k] = newVal
		}
	}

	id, _ := merged["id"].(string)
	out := &MenuMergeOutput{
		MergedMenu: []any{merged},
		Edited:     len(deltas),
		PatchOps: []PatchOp{{
			Action: "edit", NodeID: id, NodeName: menuNodeName(merged),
			ChangedFields: deltas,
		}},
	}
	return out, nil
}

func parseSingleMenuNode(jsonText string) (map[string]any, error) {
	var parsed any
	if err := json.Unmarshal([]byte(strings.TrimSpace(jsonText)), &parsed); err != nil {
		return nil, err
	}
	switch v := parsed.(type) {
	case []any:
		if len(v) == 0 {
			return map[string]any{}, nil
		}
		if m, ok := v[0].(map[string]any); ok {
			return m, nil
		}
	case map[string]any:
		return v, nil
	}
	return map[string]any{}, nil
}

func flattenMenuTree(tree []any, idMap map[string]map[string]any, paths map[string]string, parentPath string) {
	for _, item := range tree {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id, _ := m["id"].(string)
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		name := menuNodeName(m)
		path := name
		if parentPath != "" {
			path = parentPath + " / " + name
		}
		idMap[id] = m
		paths[id] = path
		if children, ok := m["children"].([]any); ok {
			flattenMenuTree(children, idMap, paths, path)
		}
	}
}

func menuNodeName(node map[string]any) string {
	for _, key := range []string{"label_vi", "labelVi", "label", "name"} {
		if v, ok := node[key].(string); ok {
			v = strings.TrimSpace(v)
			if v != "" {
				return v
			}
		}
	}
	if id, ok := node["id"].(string); ok {
		return id
	}
	return ""
}

func computeMenuFieldDelta(oldNode, newNode map[string]any) []FieldDelta {
	var out []FieldDelta
	for k, newVal := range newNode {
		if skipDiffFields[k] {
			continue
		}
		oldVal := oldNode[k]
		if !jsonEqual(oldVal, newVal) {
			out = append(out, FieldDelta{
				FieldName: k, OldVal: scalarText(oldVal), NewVal: scalarText(newVal),
			})
		}
	}
	return out
}

func mergeTreePreservingBase(oldTree []any, newMap map[string]map[string]any) []any {
	result := make([]any, 0, len(oldTree))
	visited := map[string]bool{}

	for _, item := range oldTree {
		oldNode, ok := item.(map[string]any)
		if !ok {
			continue
		}
		merged := deepCopyMap(oldNode)
		id, _ := merged["id"].(string)
		id = strings.TrimSpace(id)
		if id != "" {
			if newNode, ok := newMap[id]; ok {
				for k, v := range newNode {
					switch k {
					case "id", "parentId", "parent_id", "menu_id", "children":
						continue
					}
					merged[k] = deepCopyValue(v)
				}
				visited[id] = true
			}
		}
		if children, ok := merged["children"].([]any); ok {
			merged["children"] = mergeTreePreservingBase(children, newMap)
		}
		result = append(result, merged)
	}

	for id, newNode := range newMap {
		if visited[id] {
			continue
		}
		parentID := firstNonBlank(
			fmt.Sprint(newNode["parentId"]),
			fmt.Sprint(newNode["parent_id"]),
		)
		if strings.TrimSpace(parentID) == "" || parentID == "<nil>" {
			result = append(result, deepCopyMap(newNode))
		}
	}
	return result
}

func mergeTableArray(oldTable, newTable []any, deltas *[]FieldDelta, parentField string) []any {
	oldByFname := map[string]map[string]any{}
	for _, row := range oldTable {
		m, ok := row.(map[string]any)
		if !ok {
			continue
		}
		if fname, ok := m["f_name"].(string); ok {
			oldByFname[fname] = deepCopyMap(m)
		}
	}
	result := make([]any, 0)
	processed := map[string]bool{}

	for _, row := range newTable {
		m, ok := row.(map[string]any)
		if !ok {
			continue
		}
		fname, _ := m["f_name"].(string)
		if fname != "" && oldByFname[fname] != nil {
			mergedRow := oldByFname[fname]
			for k, v := range m {
				oldV := mergedRow[k]
				if !jsonEqual(oldV, v) {
					*deltas = append(*deltas, FieldDelta{
						FieldName: parentField + "." + fname + "." + k,
						OldVal: scalarText(oldV), NewVal: scalarText(v),
					})
					mergedRow[k] = v
				}
			}
			result = append(result, mergedRow)
			processed[fname] = true
		} else {
			result = append(result, m)
			if fname != "" {
				processed[fname] = true
				*deltas = append(*deltas, FieldDelta{
					FieldName: parentField + "." + fname, OldVal: nil, NewVal: "added",
				})
			}
		}
	}
	for fname, row := range oldByFname {
		if !processed[fname] {
			result = append(result, row)
		}
	}
	return result
}

func deepCopyMap(m map[string]any) map[string]any {
	b, _ := json.Marshal(m)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	if out == nil {
		out = map[string]any{}
	}
	return out
}

func deepCopyValue(v any) any {
	b, _ := json.Marshal(v)
	var out any
	_ = json.Unmarshal(b, &out)
	return out
}

func jsonEqual(a, b any) bool {
	ab, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ab) == string(bb)
}

func scalarText(v any) any {
	if v == nil {
		return nil
	}
	switch x := v.(type) {
	case string:
		return x
	case float64, bool, int, int64:
		return fmt.Sprint(x)
	default:
		b, err := json.Marshal(x)
		if err != nil {
			return fmt.Sprint(x)
		}
		return string(b)
	}
}

func firstNonBlank(vals ...string) string {
	for _, v := range vals {
		v = strings.TrimSpace(v)
		if v != "" && v != "<nil>" {
			return v
		}
	}
	return ""
}
