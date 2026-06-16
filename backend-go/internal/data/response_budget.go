package data

import (
	"encoding/json"
)

const (
	maxResponsePayloadBytes = 64 << 20
	maxSafeJSONRecordBytes  = 32 << 20
)

func estimateRecordJSONBytes(record map[string]any) int {
	if record == nil {
		return 0
	}
	b, err := json.Marshal(record)
	if err != nil {
		return 0
	}
	return len(b)
}

func appendRowWithinBudget(rows []any, record map[string]any, payloadBytes *int64) ([]any, bool) {
	size := int64(estimateRecordJSONBytes(record))
	if size > maxSafeJSONRecordBytes {
		return rows, false
	}
	if *payloadBytes+size > maxResponsePayloadBytes {
		return rows, true
	}
	*payloadBytes += size
	return append(rows, record), false
}

func rowsFromRecordsWithBudget(records []map[string]any) (rows []any, truncated bool) {
	var payloadBytes int64
	for _, rec := range records {
		var stop bool
		rows, stop = appendRowWithinBudget(rows, rec, &payloadBytes)
		if stop {
			return rows, true
		}
	}
	return rows, false
}

func attachTruncatedFlag(result map[string]any, truncated bool) map[string]any {
	if truncated {
		result["truncated"] = true
	}
	return result
}
