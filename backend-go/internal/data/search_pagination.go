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

func (rm *RecordManager) filterWithEqIndexTableList(
	appID, tableName string,
	filter model.SearchFilter,
	offset, take int,
) map[string]any {
	if rm.eqIndex == nil {
		return nil
	}
	keys, total := rm.eqIndex.listTablePebbleKeys(appID, tableName, offset, take)
	if total == 0 {
		return map[string]any{"rows": []any{}, "data": []any{}, "totalCount": 0}
	}
	records := rm.loadRecordsByPebbleKeys(keys, filter)
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
		} else if isUnfilteredListQuery(filter) {
			if meta := rm.readTableRowMetaCount(appID, tableName); meta > 0 {
				total = meta
			}
			return errScanStop
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

// FilterFirstPageFast returns the first page quickly without scanning the full table for exact totalCount.
// It is intended for SSR/listing paths where first-contentful response time matters more than exact totals.
func (rm *RecordManager) FilterFirstPageFast(
	appID, tableName string,
	filter model.SearchFilter,
	take int,
) map[string]any {
	if take <= 0 {
		take = DefaultFilterTake
	}
	if take > maxFilterTake {
		take = maxFilterTake
	}

	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return map[string]any{"rows": []any{}, "data": []any{}, "totalCount": 0}
	}

	page := make([]map[string]any, 0, take)
	rowKeys := make([]string, 0, take)
	var payloadBytes int64
	hasMore := false
	truncated := false

	_ = rm.scanAllRecordSources(app, table, func(storageKey string, raw []byte) error {
		var record map[string]any
		if json.Unmarshal(raw, &record) != nil || !filter.Matches(record) {
			return nil
		}
		if len(page) >= take {
			hasMore = true
			return errScanStop
		}
		rows, stop := appendRowWithinBudget(nil, record, &payloadBytes)
		if stop {
			truncated = true
			return errScanStop
		}
		if len(rows) == 0 {
			return nil
		}
		page = append(page, record)
		rk := recordKey(record)
		if rk == "" {
			rk = storageKey
		}
		rowKeys = append(rowKeys, rk)
		return nil
	})

	slice := make([]any, 0, len(page))
	for _, r := range page {
		slice = append(slice, r)
	}

	totalCount := len(page)
	if hasMore {
		// Signal that more rows likely exist without paying full scan cost.
		totalCount = len(page) + 1
	}

	result := map[string]any{
		"rows":       slice,
		"data":       slice,
		"totalCount": totalCount,
	}
	if hasMore {
		result["estimatedTotalCount"] = true
	}
	if truncated {
		result["truncated"] = true
	}
	if hasMore && len(rowKeys) > 0 {
		result["nextCursor"] = rowKeys[len(rowKeys)-1]
	}
	return result
}

func (rm *RecordManager) filterWithSortPagination(
	appID, tableName string,
	filter model.SearchFilter,
	offset, take int,
	sortSpecs []model.SortSpec,
) map[string]any {
	records := rm.collectFilteredRecords(appID, tableName, filter)
	total := len(records)
	sortTruncated := false
	if total > maxSortMaterialize {
		records = records[:maxSortMaterialize]
		sortTruncated = true
	}
	SortRecords(records, sortSpecs)
	page := paginateRecordMaps(records, offset, take)
	slice := make([]any, 0, len(page))
	for _, r := range page {
		slice = append(slice, r)
	}
	result := map[string]any{
		"rows":       slice,
		"data":       slice,
		"totalCount": total,
	}
	if sortTruncated {
		result["sortTruncated"] = true
	}
	return result
}
