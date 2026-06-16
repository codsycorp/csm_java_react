package data

import (
	"fmt"
	"strings"

	"csm_server/backend-go/internal/model"
)

const maxEqIndexKeys = 50_000

func eqIndexSchemaStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS records_eq_idx (
			app_id TEXT NOT NULL,
			table_name TEXT NOT NULL,
			field_name TEXT NOT NULL,
			field_value TEXT NOT NULL,
			pebble_key TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS records_eq_idx_lookup
		 ON records_eq_idx(app_id, table_name, field_name, field_value)`,
		`CREATE INDEX IF NOT EXISTS records_eq_idx_pebble
		 ON records_eq_idx(pebble_key)`,
	}
}

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
	if rm.searchDB == nil || pebbleKey == "" || record == nil {
		return
	}
	_, _ = rm.searchDB.Exec(`DELETE FROM records_eq_idx WHERE pebble_key = ?`, pebbleKey)
	for field, value := range record {
		if !isIndexableEqField(field, value) {
			continue
		}
		norm := normalizeEqIndexValue(value)
		if norm == "" {
			continue
		}
		_, _ = rm.searchDB.Exec(
			`INSERT INTO records_eq_idx(app_id, table_name, field_name, field_value, pebble_key)
			 VALUES (?, ?, ?, ?, ?)`,
			appID, tableName, field, norm, pebbleKey,
		)
	}
}

func (rm *RecordManager) deleteEqIndex(pebbleKey string) {
	if rm.searchDB == nil || pebbleKey == "" {
		return
	}
	_, _ = rm.searchDB.Exec(`DELETE FROM records_eq_idx WHERE pebble_key = ?`, pebbleKey)
}

func (rm *RecordManager) deleteEqIndexForTable(appID, tableName string) {
	if rm.searchDB == nil {
		return
	}
	_, _ = rm.searchDB.Exec(`DELETE FROM records_eq_idx WHERE app_id = ? AND table_name = ?`, appID, tableName)
}

func (rm *RecordManager) searchKeysConsistent(appID, tableName string, filter model.SearchFilter) []string {
	if rm.searchDB == nil || filter.HasLike() {
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
		batch, err := rm.eqIndexKeys(app, table, field, norm)
		if err != nil || len(batch) == 0 {
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

func (rm *RecordManager) eqIndexKeys(appID, tableName, fieldName, fieldValue string) ([]string, error) {
	rows, err := rm.searchDB.Query(
		`SELECT pebble_key FROM records_eq_idx
		 WHERE app_id = ? AND table_name = ? AND field_name = ? AND field_value = ?
		 LIMIT ?`,
		appID, tableName, fieldName, fieldValue, maxEqIndexKeys,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return keys, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
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
