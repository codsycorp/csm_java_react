package data

import (
	"sort"
	"strings"

	"csm_server/backend-go/internal/model"
)

func SortRecords(records []map[string]any, specs []model.SortSpec) {
	if len(records) < 2 || len(specs) == 0 {
		return
	}
	sort.SliceStable(records, func(i, j int) bool {
		for _, spec := range specs {
			field := strings.TrimSpace(spec.Field)
			if field == "" {
				continue
			}
			cmp := compareRecordField(records[i], records[j], field)
			if cmp == 0 {
				continue
			}
			if model.NormalizeSortOrder(spec.Order) == "desc" {
				return cmp > 0
			}
			return cmp < 0
		}
		return false
	})
}

func compareRecordField(left, right map[string]any, field string) int {
	lv, lok := left[field]
	rv, rok := right[field]
	if !lok && !rok {
		return 0
	}
	if !lok {
		return -1
	}
	if !rok {
		return 1
	}
	return model.CompareRecordValues(lv, rv)
}

func paginateRecordMaps(records []map[string]any, offset, take int) []map[string]any {
	total := len(records)
	if total == 0 || take <= 0 {
		return nil
	}
	start := offset
	if start < 0 {
		start = 0
	}
	if start >= total {
		return nil
	}
	end := start + take
	if end > total {
		end = total
	}
	return records[start:end]
}
