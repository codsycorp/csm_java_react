package data

import (
	"log"
	"strings"
)

// countPebbleRows counts user records in the per-table Pebble store (+ legacy fallback).
func (rm *RecordManager) countPebbleRows(appID, tableName string) int {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return 0
	}
	count := 0
	_ = rm.scanAllRecordSources(app, table, func(_ string, _ []byte) error {
		count++
		return nil
	})
	return count
}

func (rm *RecordManager) countEqIndexPebbleKeys(appID, tableName string) int {
	if rm.eqIndex == nil {
		return 0
	}
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return 0
	}
	return rm.eqIndex.countTableKeys(app, table)
}

func (rm *RecordManager) needsSearchReindex(appID, tableName string) bool {
	if rm.eqIndex == nil {
		return false
	}
	pebbleRows := rm.countPebbleRows(appID, tableName)
	if pebbleRows == 0 {
		return false
	}
	indexedKeys := rm.countEqIndexPebbleKeys(appID, tableName)
	return indexedKeys < pebbleRows
}

func parseStartupTableRef(ref string) (appID, tableName string, ok bool) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", "", false
	}
	parts := strings.SplitN(ref, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func (rm *RecordManager) runStartupReindex(tables []string) {
	for _, ref := range tables {
		appID, tableName, ok := parseStartupTableRef(ref)
		if !ok {
			log.Printf("[startup-reindex] skip invalid table ref %q (want app_id/table_name)", ref)
			continue
		}
		if !rm.needsSearchReindex(appID, tableName) {
			rm.syncSearchIndexCompleteIfAligned(appID, tableName)
			log.Printf("[startup-reindex] %s/%s index OK (pebble=%d eq_keys=%d)",
				appID, tableName, rm.countPebbleRows(appID, tableName), rm.countEqIndexPebbleKeys(appID, tableName))
			continue
		}
		pebbleRows := rm.countPebbleRows(appID, tableName)
		indexedKeys := rm.countEqIndexPebbleKeys(appID, tableName)
		log.Printf("[startup-reindex] rebuilding %s/%s (pebble=%d indexed_keys=%d)…",
			appID, tableName, pebbleRows, indexedKeys)
		count, err := rm.IndexEqIndexOnly(appID, tableName)
		if err != nil {
			log.Printf("[startup-reindex] %s/%s failed: %v", appID, tableName, err)
			continue
		}
		log.Printf("[startup-reindex] %s/%s done: %d records indexed", appID, tableName, count)
	}
}
