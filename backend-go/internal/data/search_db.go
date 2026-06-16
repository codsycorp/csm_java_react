package data

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"csm_server/backend-go/internal/model"
)

const (
	minSearchTextLen = 8
)

func (rm *RecordManager) searchEnabled() bool {
	return rm.eqIndex != nil
}

func (rm *RecordManager) loadRecordByPebbleKey(pebbleKey string) (map[string]any, error) {
	appID, tableName, storageKey, err := ParsePebbleKey(pebbleKey)
	if err != nil {
		return nil, err
	}
	val, err := rm.getRecordBytes(appID, tableName, storageKey)
	if err != nil {
		return nil, err
	}
	var record map[string]any
	if err := json.Unmarshal(val, &record); err != nil {
		return nil, err
	}
	return record, nil
}

func (rm *RecordManager) collectViaLikeScan(appID, tableName string, filter model.SearchFilter) []map[string]any {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}

	seen := make(map[string]struct{})
	var records []map[string]any
	err = rm.scanAllRecordSources(app, table, func(storageKey string, raw []byte) error {
		var record map[string]any
		if json.Unmarshal(raw, &record) != nil || !filter.Matches(record) {
			return nil
		}
		dedup := recordKey(record)
		if dedup == "" {
			dedup = storageKey
		}
		if _, ok := seen[dedup]; ok {
			return nil
		}
		seen[dedup] = struct{}{}
		records = append(records, record)
		return nil
	})
	if err != nil {
		log.Printf("like scan failed %s/%s: %v", app, table, err)
	}
	return records
}

func (rm *RecordManager) upsertSearchIndex(appID, tableName, pebbleKey, storageKey string, record map[string]any) {
	rm.upsertEqIndex(appID, tableName, pebbleKey, record)

	title, content := ExtractSearchText(record)
	if isAuthTable(tableName) {
		return
	}
	if len(content) < minSearchTextLen {
		rm.deleteVectorIndex(pebbleKey)
		return
	}
	recordID := recordIDFromMap(record, storageKey)

	if rm.vectorStore != nil {
		meta := map[string]string{
			"app_id": appID, "table_name": tableName, "record_id": recordID,
			"pebble_key": pebbleKey, "title": title,
		}
		_ = rm.vectorStore.upsertDoc(vectorCollRecords, pebbleKey, meta, title+"\n"+content)
	}
}

func (rm *RecordManager) deleteVectorIndex(pebbleKey string) {
	if pebbleKey == "" || rm.vectorStore == nil {
		return
	}
	_ = rm.vectorStore.deleteDoc(vectorCollRecords, pebbleKey)
}

func (rm *RecordManager) deleteSearchIndex(pebbleKey string) {
	if pebbleKey == "" {
		return
	}
	rm.deleteEqIndex(pebbleKey)
	rm.deleteVectorIndex(pebbleKey)
}

func (rm *RecordManager) deleteSearchIndexForTable(appID, tableName string) {
	rm.deleteEqIndexForTable(appID, tableName)
	if rm.vectorStore != nil {
		_ = rm.vectorStore.deleteWhere(vectorCollRecords, map[string]string{
			"app_id": appID, "table_name": tableName,
		})
	}
}

// IndexExistingRecords rebuilds in-memory eq-index and optional vector index for all Pebble rows.
func (rm *RecordManager) IndexExistingRecords(appID, tableName string) (int, error) {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return 0, err
	}
	if rm.eqIndex == nil && rm.vectorStore == nil {
		return 0, fmt.Errorf("search index unavailable (set CSM_VECTOR_DIR or restart server)")
	}
	rm.deleteSearchIndexForTable(app, table)
	rm.markSearchIndexIncomplete(app, table)

	indexed := 0
	err = rm.scanAllRecordSources(app, table, func(storageKey string, raw []byte) error {
		var record map[string]any
		if json.Unmarshal(raw, &record) != nil {
			return nil
		}
		pebbleKey := PebbleKey(app, table, storageKey)
		rm.upsertSearchIndex(app, table, pebbleKey, storageKey, record)
		indexed++
		return nil
	})
	if err != nil {
		return 0, err
	}
	pebbleRows := rm.countPebbleRows(app, table)
	indexedKeys := rm.countEqIndexPebbleKeys(app, table)
	rm.markSearchIndexComplete(app, table, pebbleRows, indexedKeys)
	log.Printf("search reindex %s/%s: %d records (pebble=%d eq_keys=%d)", app, table, indexed, pebbleRows, indexedKeys)
	return indexed, nil
}

func buildFTSMatchQuery(terms []string) string {
	parts := make([]string, 0, len(terms))
	for _, term := range terms {
		q := ftsTermQuery(term)
		if q != "" {
			parts = append(parts, q)
		}
	}
	return strings.Join(parts, " AND ")
}

func ftsTermQuery(term string) string {
	term = strings.TrimSpace(strings.Trim(term, "%"))
	if term == "" {
		return ""
	}
	term = strings.ReplaceAll(term, `"`, `""`)
	return `"` + term + `"*`
}
