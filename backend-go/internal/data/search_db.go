package data

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"csm_server/backend-go/internal/model"

	_ "modernc.org/sqlite"
)

const (
	maxFTSCandidateKeys = 50_000
	minSearchTextLen    = 8
)

func openSearchDB(path string) (*sql.DB, error) {
	if path == "" {
		return nil, fmt.Errorf("search db path empty")
	}
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	schema := []string{
		`CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
			pebble_key UNINDEXED,
			app_id UNINDEXED,
			table_name UNINDEXED,
			record_id UNINDEXED,
			title,
			content,
			tokenize='unicode61'
		)`,
	}
	for _, q := range schema {
		if _, err := db.Exec(q); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("search schema: %w", err)
		}
	}
	return db, nil
}

func (rm *RecordManager) searchEnabled() bool {
	return rm.searchDB != nil
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

func (rm *RecordManager) ftsSearchKeys(appID, tableName, match string, limit int) ([]string, error) {
	if rm.searchDB == nil || match == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = maxFTSCandidateKeys
	}
	rows, err := rm.searchDB.Query(
		`SELECT pebble_key FROM records_fts
		 WHERE app_id = ? AND table_name = ? AND records_fts MATCH ?
		 LIMIT ?`,
		appID, tableName, match, limit,
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

func (rm *RecordManager) collectViaFTS(appID, tableName string, filter model.SearchFilter) []map[string]any {
	terms := filter.CollectLikeTerms()
	match := buildFTSMatchQuery(terms)
	if match == "" {
		return nil
	}
	keys, err := rm.ftsSearchKeys(appID, tableName, match, maxFTSCandidateKeys)
	if err != nil {
		log.Printf("FTS search failed %s/%s: %v — falling back to Pebble scan", appID, tableName, err)
		return nil
	}
	if len(keys) == 0 {
		return nil
	}

	seen := make(map[string]struct{})
	var records []map[string]any
	for _, pebbleKey := range keys {
		record, err := rm.loadRecordByPebbleKey(pebbleKey)
		if err != nil || record == nil {
			continue
		}
		if !filter.Matches(record) {
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

func (rm *RecordManager) upsertSearchIndex(appID, tableName, pebbleKey, storageKey string, record map[string]any) {
	if rm.searchDB == nil {
		return
	}
	title, content := ExtractSearchText(record)
	if len(content) < minSearchTextLen {
		rm.deleteSearchIndex(pebbleKey)
		return
	}
	recordID := recordIDFromMap(record, storageKey)
	_, _ = rm.searchDB.Exec(`DELETE FROM records_fts WHERE pebble_key = ?`, pebbleKey)
	_, err := rm.searchDB.Exec(
		`INSERT INTO records_fts(pebble_key, app_id, table_name, record_id, title, content)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		pebbleKey, appID, tableName, recordID, title, content,
	)
	if err != nil {
		log.Printf("FTS upsert failed %s: %v", pebbleKey, err)
	}
}

func (rm *RecordManager) deleteSearchIndex(pebbleKey string) {
	if rm.searchDB == nil || pebbleKey == "" {
		return
	}
	_, _ = rm.searchDB.Exec(`DELETE FROM records_fts WHERE pebble_key = ?`, pebbleKey)
}

func (rm *RecordManager) deleteSearchIndexForTable(appID, tableName string) {
	if rm.searchDB == nil {
		return
	}
	_, _ = rm.searchDB.Exec(`DELETE FROM records_fts WHERE app_id = ? AND table_name = ?`, appID, tableName)
}

// IndexExistingRecords rebuilds FTS for all Pebble rows in a table (Java indexExistingRecords).
func (rm *RecordManager) IndexExistingRecords(appID, tableName string) (int, error) {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return 0, err
	}
	if rm.searchDB == nil {
		return 0, fmt.Errorf("search index unavailable (missing %s)", rm.cfg.SearchDBPath)
	}
	rm.deleteSearchIndexForTable(app, table)

	indexed := 0
	err = rm.scanTable(app, table, func(storageKey string, raw []byte) error {
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
	log.Printf("FTS reindex %s/%s: %d records", app, table, indexed)
	return indexed, nil
}
