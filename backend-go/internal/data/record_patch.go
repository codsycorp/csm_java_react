package data

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/cockroachdb/pebble"
)

func isAuthTable(tableName string) bool {
	switch strings.ToLower(strings.TrimSpace(tableName)) {
	case "csm_accounts", "csm_group_members":
		return true
	default:
		return false
	}
}

// PatchRecord merges fields into an existing row with a fast Pebble write + eq-index only.
// Used for session token updates (login/logout) — avoids CreateRecord PK scans and chromem re-index.
func (rm *RecordManager) PatchRecord(appID, tableName string, record map[string]any, pkFields []string) error {
	if record == nil {
		return fmt.Errorf("patch record nil")
	}
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return err
	}
	if len(pkFields) == 0 {
		pkFields = []string{"id"}
	}
	storageKey := rm.buildPrimaryKey(app, table, record, pkFields)
	if storageKey == "" {
		return fmt.Errorf("patch: empty storage key")
	}
	db, err := rm.tableDB(app, table)
	if err != nil {
		return err
	}
	raw, err := json.Marshal(record)
	if err != nil {
		return err
	}
	if err := db.Set([]byte(storageKey), raw, pebble.Sync); err != nil {
		return err
	}
	rm.upsertEqIndex(app, table, PebbleKey(app, table, storageKey), record)
	return nil
}

// IndexEqIndexOnly rebuilds in-memory eq-index without chromem vector writes.
func (rm *RecordManager) IndexEqIndexOnly(appID, tableName string) (int, error) {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return 0, err
	}
	if rm.eqIndex == nil {
		return 0, fmt.Errorf("eq-index unavailable")
	}
	rm.deleteEqIndexForTable(app, table)
	rm.markSearchIndexIncomplete(app, table)

	indexed := 0
	err = rm.scanAllRecordSources(app, table, func(storageKey string, raw []byte) error {
		var record map[string]any
		if json.Unmarshal(raw, &record) != nil {
			return nil
		}
		rm.upsertEqIndex(app, table, PebbleKey(app, table, storageKey), record)
		indexed++
		return nil
	})
	if err != nil {
		return 0, err
	}
	pebbleRows := rm.countPebbleRows(app, table)
	indexedKeys := rm.countEqIndexPebbleKeys(app, table)
	rm.markSearchIndexComplete(app, table, pebbleRows, indexedKeys)
	return indexed, nil
}

func (rm *RecordManager) warmAuthEqIndex() {
	for _, ref := range []string{"csm/csm_accounts", "csm/csm_group_members"} {
		appID, tableName, ok := parseStartupTableRef(ref)
		if !ok {
			continue
		}
		pebbleRows := rm.countPebbleRows(appID, tableName)
		if pebbleRows == 0 {
			continue
		}
		if !rm.needsSearchReindex(appID, tableName) {
			rm.syncSearchIndexCompleteIfAligned(appID, tableName)
			continue
		}
		n, err := rm.IndexEqIndexOnly(appID, tableName)
		if err != nil {
			log.Printf("[auth-eq-index] %s/%s failed: %v", appID, tableName, err)
			continue
		}
		log.Printf("[auth-eq-index] %s/%s ready: %d rows indexed", appID, tableName, n)
	}
}
