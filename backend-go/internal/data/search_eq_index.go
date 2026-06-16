package data

import (
	"fmt"
	"strings"

	"csm_server/backend-go/internal/model"
)

const maxEqIndexKeys = 50_000

func normalizeEqIndexValue(value any) string {
	if value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case bool:
		if v {
			return "true"
		}
		return "false"
	case float64:
		return fmt.Sprintf("%g", v)
	case int:
		return fmt.Sprintf("%d", v)
	case int64:
		return fmt.Sprintf("%d", v)
	default:
		return strings.TrimSpace(fmt.Sprint(value))
	}
}

func isIndexableEqField(field string, value any) bool {
	field = strings.TrimSpace(field)
	if field == "" || strings.HasPrefix(field, "_") {
		return false
	}
	switch strings.ToLower(field) {
	case "code", "content", "data", "json", "html", "body", "note", "notes", "description", "template", "config":
		if s, ok := value.(string); ok && len(s) > 256 {
			return false
		}
	}
	switch v := value.(type) {
	case string:
		return len(v) <= 512
	case bool, float64, int, int64:
		return true
	default:
		return false
	}
}

func (rm *RecordManager) upsertEqIndex(appID, tableName, pebbleKey string, record map[string]any) {
	if rm.eqIndex == nil || pebbleKey == "" || record == nil {
		return
	}
	rm.eqIndex.upsert(appID, tableName, pebbleKey, record)
}

func (rm *RecordManager) deleteEqIndex(pebbleKey string) {
	if rm.eqIndex == nil || pebbleKey == "" {
		return
	}
	rm.eqIndex.deletePebbleKey(pebbleKey)
}

func (rm *RecordManager) deleteEqIndexForTable(appID, tableName string) {
	if rm.eqIndex == nil {
		return
	}
	rm.eqIndex.deleteTable(appID, tableName)
}

func (rm *RecordManager) searchKeysConsistent(appID, tableName string, filter model.SearchFilter) []string {
	if rm.eqIndex == nil || filter.HasLike() {
		return nil
	}
	eq := extractEqConditions(filter)
	if len(eq) == 0 {
		return nil
	}

	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}

	var keys []string
	first := true
	for field, value := range eq {
		norm := normalizeEqIndexValue(value)
		if norm == "" {
			return nil
		}
		batch := rm.eqIndexKeys(app, table, field, norm)
		if len(batch) == 0 {
			return nil
		}
		if first {
			keys = batch
			first = false
			continue
		}
		keys = intersectStringSlices(keys, batch)
		if len(keys) == 0 {
			return nil
		}
	}
	return keys
}

func (rm *RecordManager) eqIndexKeys(appID, tableName, fieldName, fieldValue string) []string {
	if rm.eqIndex == nil {
		return nil
	}
	return rm.eqIndex.keys(appID, tableName, fieldName, fieldValue, maxEqIndexKeys)
}

func intersectStringSlices(a, b []string) []string {
	if len(a) == 0 || len(b) == 0 {
		return nil
	}
	set := make(map[string]struct{}, len(a))
	for _, s := range a {
		set[s] = struct{}{}
	}
	out := make([]string, 0, len(b))
	for _, s := range b {
		if _, ok := set[s]; ok {
			out = append(out, s)
		}
	}
	return out
}

func (rm *RecordManager) loadRecordsByPebbleKeys(keys []string, filter model.SearchFilter) []map[string]any {
	if len(keys) == 0 {
		return nil
	}
	seen := make(map[string]struct{})
	records := make([]map[string]any, 0, len(keys))
	for _, pebbleKey := range keys {
		record, err := rm.loadRecordByPebbleKey(pebbleKey)
		if err != nil || record == nil || !filter.Matches(record) {
			continue
		}
		dedup := recordKey(record)
		if dedup == "" {
			dedup = RocksKeyFromPebbleKey(pebbleKey)
		}
		if _, ok := seen[dedup]; ok {
			continue
		}
		seen[dedup] = struct{}{}
		records = append(records, record)
	}
	return records
}

func (rm *RecordManager) collectViaEqIndex(appID, tableName string, filter model.SearchFilter) []map[string]any {
	keys := rm.searchKeysConsistent(appID, tableName, filter)
	if len(keys) == 0 {
		return nil
	}
	return rm.loadRecordsByPebbleKeys(keys, filter)
}
