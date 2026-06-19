package model

import "strings"

type SortSpec struct {
	Field string `json:"field"`
	Order string `json:"order"`
}

func NormalizeSortOrder(order string) string {
	switch strings.ToLower(strings.TrimSpace(order)) {
	case "desc", "descend", "descending":
		return "desc"
	default:
		return "asc"
	}
}

// CompareRecordValues orders two cell values for server-side grid sort.
func CompareRecordValues(a, b any) int {
	return compareValues(a, b)
}
