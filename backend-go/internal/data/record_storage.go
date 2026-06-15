package data

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"

	"github.com/cockroachdb/pebble"
	"github.com/google/uuid"
)

// resolveStorageKeyByID mirrors Java resolveStorageKeyById (Lucene/FTS first, then Pebble scan).
func (rm *RecordManager) resolveStorageKeyByID(appID, tableName string, record map[string]any) string {
	idVal, ok := record["id"]
	if !ok {
		return ""
	}
	idStr := strings.TrimSpace(fmt.Sprint(idVal))
	if idStr == "" {
		return ""
	}
	keys := rm.findStorageKeysByID(appID, tableName, idStr)
	if len(keys) > 0 {
		return keys[0]
	}
	return ""
}

// resolveExistingStorageKey mirrors Java resolveExistingStorageKey / buildLegacyKeyCandidates.
func (rm *RecordManager) resolveExistingStorageKey(appID, tableName, canonicalKey string) string {
	if strings.TrimSpace(canonicalKey) == "" {
		return canonicalKey
	}
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return canonicalKey
	}
	for _, candidate := range StorageKeyCandidates(app, table, canonicalKey) {
		if _, err := rm.getRecordBytes(app, table, candidate); err == nil {
			return candidate
		}
	}
	return canonicalKey
}

// findStorageKeysByID mirrors Java findStorageKeysById (searchKeys via Lucene, verify in store).
func (rm *RecordManager) findStorageKeysByID(appID, tableName, idValue string) []string {
	idValue = strings.TrimSpace(idValue)
	if idValue == "" {
		return nil
	}

	var keys []string
	seen := make(map[string]struct{})

	appendKey := func(storageKey string) {
		if storageKey == "" {
			return
		}
		if _, ok := seen[storageKey]; ok {
			return
		}
		app, table, err := rm.sanitizeTable(appID, tableName)
		if err != nil {
			return
		}
		if _, err := rm.getRecordBytes(app, table, storageKey); err != nil {
			return
		}
		seen[storageKey] = struct{}{}
		keys = append(keys, storageKey)
	}

	if rm.searchEnabled() {
		for _, pebbleKey := range rm.searchPebbleKeysByID(appID, tableName, idValue) {
			_, _, storageKey, err := ParsePebbleKey(pebbleKey)
			if err != nil {
				continue
			}
			rec, err := rm.loadRecordByPebbleKey(pebbleKey)
			if err != nil || rec == nil {
				continue
			}
			if strings.TrimSpace(fmt.Sprint(rec["id"])) != idValue {
				continue
			}
			appendKey(storageKey)
		}
	}
	if len(keys) > 0 {
		return keys
	}

	_ = rm.scanAllRecordSources(appID, tableName, func(storageKey string, raw []byte) error {
		var rec map[string]any
		if json.Unmarshal(raw, &rec) != nil {
			return nil
		}
		if strings.TrimSpace(fmt.Sprint(rec["id"])) == idValue {
			appendKey(storageKey)
		}
		return nil
	})
	return keys
}

func (rm *RecordManager) searchPebbleKeysByID(appID, tableName, idValue string) []string {
	match := buildFTSMatchQuery([]string{idValue})
	if match == "" {
		return nil
	}
	keys, err := rm.ftsSearchKeys(appID, tableName, match, maxFTSCandidateKeys)
	if err != nil {
		log.Printf("FTS id lookup failed %s/%s id=%s: %v", appID, tableName, idValue, err)
		return nil
	}
	return keys
}

// scanAllRecordSources walks the per-table Pebble store and legacy monolithic fallback keys.
func (rm *RecordManager) scanAllRecordSources(appID, tableName string, fn func(storageKey string, raw []byte) error) error {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return err
	}

	perTableKeys := make(map[string]struct{})
	_ = rm.scanTable(app, table, func(storageKey string, raw []byte) error {
		perTableKeys[storageKey] = struct{}{}
		return fn(storageKey, raw)
	})

	rm.legacyMu.RLock()
	legacy := rm.legacyDB
	rm.legacyMu.RUnlock()
	if legacy == nil {
		return nil
	}

	prefix := []byte(TablePrefix(app, table))
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
		if _, inPerTable := perTableKeys[storageKey]; inPerTable {
			continue
		}
		raw := append([]byte(nil), liter.Value()...)
		if err := fn(storageKey, raw); err != nil {
			return err
		}
	}
	return nil
}

func (rm *RecordManager) ensureRecordID(tableName string, record map[string]any) {
	if strings.EqualFold(tableName, "index") {
		return
	}
	idVal, ok := record["id"]
	if !ok || strings.TrimSpace(fmt.Sprint(idVal)) == "" {
		record["id"] = uuid.NewString()
	}
}

func (rm *RecordManager) incrementMetaCount(db *pebble.DB) {
	rm.adjustMetaCount(db, 1)
}

func (rm *RecordManager) decrementMetaCount(db *pebble.DB) {
	rm.adjustMetaCount(db, -1)
}

func (rm *RecordManager) adjustMetaCount(db *pebble.DB, delta int64) {
	if db == nil || delta == 0 {
		return
	}
	val, closer, err := db.Get([]byte("__meta_count"))
	current := int64(0)
	if err == nil {
		defer closer.Close()
		current, _ = strconv.ParseInt(string(val), 10, 64)
	}
	next := current + delta
	if next < 0 {
		next = 0
	}
	_ = db.Set([]byte("__meta_count"), []byte(strconv.FormatInt(next, 10)), pebble.Sync)
}

func (rm *RecordManager) deleteAtStorageKey(app, table, storageKey string) bool {
	if strings.TrimSpace(storageKey) == "" {
		return false
	}
	deleted := false

	db, err := rm.tableDB(app, table)
	if err == nil {
		if _, closer, gerr := db.Get([]byte(storageKey)); gerr == nil {
			closer.Close()
			if err := db.Delete([]byte(storageKey), pebble.Sync); err == nil {
				deleted = true
				rm.decrementMetaCount(db)
			}
		}
	}

	rm.legacyMu.RLock()
	legacy := rm.legacyDB
	rm.legacyMu.RUnlock()
	if legacy != nil {
		for _, candidate := range StorageKeyCandidates(app, table, storageKey) {
			canonical := PebbleKey(app, table, candidate)
			if _, closer, gerr := legacy.Get([]byte(canonical)); gerr == nil {
				closer.Close()
				if err := legacy.Delete([]byte(canonical), pebble.Sync); err == nil {
					deleted = true
				}
			}
		}
	}

	rm.deleteSearchIndex(PebbleKey(app, table, storageKey))
	return deleted
}

func (rm *RecordManager) recordExistsAtStorageKey(app, table, storageKey string) bool {
	_, err := rm.getRecordBytes(app, table, storageKey)
	return err == nil
}

func (rm *RecordManager) deleteLegacyPKAliases(app, table, canonicalKey string) {
	rm.legacyMu.RLock()
	legacy := rm.legacyDB
	rm.legacyMu.RUnlock()
	if legacy == nil || strings.TrimSpace(canonicalKey) == "" {
		return
	}
	for _, candidate := range StorageKeyCandidates(app, table, canonicalKey) {
		pk := PebbleKey(app, table, candidate)
		if _, closer, err := legacy.Get([]byte(pk)); err != nil {
			continue
		} else {
			closer.Close()
		}
		_ = legacy.Delete([]byte(pk), pebble.Sync)
	}
}

// consolidatePKStorageKeys removes duplicate physical keys for the same logical PK,
// keeping only canonicalKey (one p_name+p_type → one Pebble row).
func (rm *RecordManager) consolidatePKStorageKeys(app, table, canonicalKey string, record map[string]any, pkFields []string, batch *pebble.Batch) {
	if batch == nil || strings.TrimSpace(canonicalKey) == "" {
		return
	}
	seen := map[string]struct{}{canonicalKey: {}}
	queueDelete := func(storageKey string) {
		storageKey = strings.TrimSpace(storageKey)
		if storageKey == "" || storageKey == canonicalKey {
			return
		}
		if _, ok := seen[storageKey]; ok {
			return
		}
		seen[storageKey] = struct{}{}
		if _, err := rm.getRecordBytes(app, table, storageKey); err != nil {
			return
		}
		_ = batch.Delete([]byte(storageKey), nil)
		rm.deleteSearchIndex(PebbleKey(app, table, storageKey))
	}

	for _, c := range StorageKeyCandidates(app, table, canonicalKey) {
		queueDelete(c)
	}
	if tableAllowsPKOrphanScan(table) {
		for _, hit := range rm.findAllByCustomPK(app, table, record, pkFields) {
			queueDelete(hit.storageKey)
		}
	}
}

func (rm *RecordManager) hasAnyPKStorage(app, table, canonicalKey, keyByID string) bool {
	if keyByID != "" && rm.recordExistsAtStorageKey(app, table, keyByID) {
		return true
	}
	for _, c := range StorageKeyCandidates(app, table, canonicalKey) {
		if rm.recordExistsAtStorageKey(app, table, c) {
			return true
		}
	}
	return false
}

func (rm *RecordManager) collectStorageKeysToDelete(appID, tableName string, record map[string]any, pkFields []string) []string {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}
	canonicalKey := rm.buildPrimaryKey(app, table, record, pkFields)
	keyByID := rm.resolveStorageKeyByID(appID, tableName, record)
	keyToDelete := keyByID
	if keyToDelete == "" {
		keyToDelete = rm.resolveExistingStorageKey(appID, tableName, canonicalKey)
	}

	seen := make(map[string]struct{})
	var out []string
	add := func(key string) {
		key = strings.TrimSpace(key)
		if key == "" {
			return
		}
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, key)
	}

	if keyByID != "" {
		if idVal, ok := record["id"]; ok {
			for _, k := range rm.findStorageKeysByID(appID, tableName, fmt.Sprint(idVal)) {
				add(k)
			}
		}
	}
	add(keyToDelete)
	for _, c := range StorageKeyCandidates(app, table, canonicalKey) {
		add(c)
	}
	if tableAllowsPKOrphanScan(table) {
		for _, hit := range rm.findAllByCustomPK(app, table, record, pkFields) {
			add(hit.storageKey)
		}
	}
	return out
}
