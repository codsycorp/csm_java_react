package data

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/cockroachdb/pebble"
)

// tableDB opens (or creates) the Pebble store for one app/table pair:
//   {PebbleRoot}/{app_id}/{table_name}/
func (rm *RecordManager) tableDB(appID, tableName string) (*pebble.DB, error) {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil, err
	}
	key := app + "/" + table

	rm.dbMu.RLock()
	if rm.closed {
		rm.dbMu.RUnlock()
		return nil, fmt.Errorf("record manager shut down")
	}
	if db, ok := rm.tableDBs[key]; ok {
		rm.dbMu.RUnlock()
		return db, nil
	}
	rm.dbMu.RUnlock()

	rm.dbMu.Lock()
	defer rm.dbMu.Unlock()
	if rm.closed {
		return nil, fmt.Errorf("record manager shut down")
	}
	if db, ok := rm.tableDBs[key]; ok {
		return db, nil
	}

	path := filepath.Join(rm.pebbleRoot, app, table)
	if err := os.MkdirAll(path, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir %s: %w", path, err)
	}
	db, err := pebble.Open(path, &pebble.Options{})
	if err != nil {
		return nil, fmt.Errorf("open pebble %s: %w", path, err)
	}
	rm.tableDBs[key] = db
	return db, nil
}

func (rm *RecordManager) tableDBPath(appID, tableName string) (string, error) {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return "", err
	}
	return filepath.Join(rm.pebbleRoot, app, table), nil
}

// getRecordBytes reads a row from the per-table store, falling back to legacy monolithic csm.kv.
func (rm *RecordManager) getRecordBytes(appID, tableName, storageKey string) ([]byte, error) {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil, err
	}
	db, err := rm.tableDB(app, table)
	if err != nil {
		return nil, err
	}
	if val, closer, err := db.Get([]byte(storageKey)); err == nil {
		defer closer.Close()
		return append([]byte(nil), val...), nil
	}

	rm.legacyMu.RLock()
	legacy := rm.legacyDB
	rm.legacyMu.RUnlock()
	if legacy == nil {
		return nil, pebble.ErrNotFound
	}

	for _, candidate := range StorageKeyCandidates(app, table, storageKey) {
		canonical := PebbleKey(app, table, candidate)
		if val, closer, err := legacy.Get([]byte(canonical)); err == nil {
			defer closer.Close()
			return append([]byte(nil), val...), nil
		}
	}
	return nil, pebble.ErrNotFound
}

func (rm *RecordManager) scanTable(appID, tableName string, fn func(storageKey string, value []byte) error) error {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return err
	}
	db, err := rm.tableDB(app, table)
	if err != nil {
		return err
	}

	count := 0
	iter, err := db.NewIter(&pebble.IterOptions{})
	if err != nil {
		return err
	}
	defer iter.Close()
	for iter.First(); iter.Valid(); iter.Next() {
		key := string(iter.Key())
		if isInternalMetaKey(key) {
			continue
		}
		count++
		if err := fn(key, append([]byte(nil), iter.Value()...)); err != nil {
			return err
		}
	}
	if count > 0 || rm.legacyDB == nil {
		return nil
	}

	prefix := []byte(TablePrefix(app, table))
	rm.legacyMu.RLock()
	legacy := rm.legacyDB
	rm.legacyMu.RUnlock()
	if legacy == nil {
		return nil
	}
	liter, err := legacy.NewIter(&pebble.IterOptions{LowerBound: prefix})
	if err != nil {
		return err
	}
	defer liter.Close()
	for liter.First(); liter.Valid(); liter.Next() {
		if !hasPrefix(liter.Key(), prefix) {
			break
		}
		storageKey := RocksKeyFromPebbleKey(string(liter.Key()))
		if err := fn(storageKey, append([]byte(nil), liter.Value()...)); err != nil {
			return err
		}
	}
	return nil
}

func (rm *RecordManager) closeTableDB(appID, tableName string) {
	app, table, _ := rm.sanitizeTable(appID, tableName)
	key := app + "/" + table
	rm.dbMu.Lock()
	defer rm.dbMu.Unlock()
	if db, ok := rm.tableDBs[key]; ok {
		_ = db.Close()
		delete(rm.tableDBs, key)
	}
}

func isInternalMetaKey(key string) bool {
	return key == "__meta_count" || key == "__migration_meta__"
}

func hasPrefix(key, prefix []byte) bool {
	return len(key) >= len(prefix) && string(key[:len(prefix)]) == string(prefix)
}
