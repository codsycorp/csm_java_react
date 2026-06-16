package data

import (
	"encoding/json"

	"csm_server/backend-go/internal/model"
)

func (rm *RecordManager) paginatePebbleKeys(
	keys []string,
	filter model.SearchFilter,
	cursor string,
	offset, take int,
) map[string]any {
	total := len(keys)
	start := offset
	if cursor != "" {
		for i, key := range keys {
			record, err := rm.loadRecordByPebbleKey(key)
			if err != nil || record == nil {
				continue
			}
			if recordKey(record) == cursor {
				start = i + 1
				break
			}
		}
	}
	end := start + take
	if end > total {
		end = total
	}
	pageKeys := keys[start:end]
	records := rm.loadRecordsByPebbleKeys(pageKeys, filter)
	var payloadBytes int64
	slice := make([]any, 0, len(records))
	truncated := false
	for _, r := range records {
		var stop bool
		slice, stop = appendRowWithinBudget(slice, r, &payloadBytes)
		if stop {
			truncated = true
			break
		}
	}
	result := map[string]any{
		"rows":       slice,
		"data":       slice,
		"totalCount": total,
	}
	if truncated {
		result["truncated"] = true
	}
	if end < total && len(records) > 0 {
		result["nextCursor"] = recordKey(records[len(records)-1])
	}
	return result
}

func (rm *RecordManager) filterWithPaginationScan(
	appID, tableName string,
	filter model.SearchFilter,
	cursor string,
	offset, take int,
) map[string]any {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return map[string]any{"rows": []any{}, "data": []any{}, "totalCount": 0}
	}

	passedCursor := cursor == ""
	startAt := offset
	if cursor != "" {
		startAt = 0
	}
	total := 0
	matched := 0
	var page []map[string]any
	var lastKey string
	var payloadBytes int64
	truncated := false

	_ = rm.scanAllRecordSources(app, table, func(storageKey string, raw []byte) error {
		var record map[string]any
		if json.Unmarshal(raw, &record) != nil || !filter.Matches(record) {
			return nil
		}
		total++
		rk := recordKey(record)
		if rk == "" {
			rk = storageKey
		}
		if !passedCursor {
			if rk == cursor {
				passedCursor = true
			}
			return nil
		}
		if matched < startAt {
			matched++
			return nil
		}
		if len(page) < take {
			var stop bool
			var rows []any
			rows, stop = appendRowWithinBudget(nil, record, &payloadBytes)
			if stop {
				truncated = true
				return errScanStop
			}
			if len(rows) > 0 {
				page = append(page, record)
				lastKey = rk
			}
		}
		return nil
	})

	slice := make([]any, 0, len(page))
	for _, r := range page {
		slice = append(slice, r)
	}
	result := map[string]any{
		"rows":       slice,
		"data":       slice,
		"totalCount": total,
	}
	if truncated {
		result["truncated"] = true
	}
	if len(page) == take && lastKey != "" {
		result["nextCursor"] = lastKey
	}
	return result
}
