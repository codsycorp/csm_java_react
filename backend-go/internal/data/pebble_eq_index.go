package data

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/cockroachdb/pebble"
)

const (
	eqIndexForwardPrefix = "f\x00"
	eqIndexReversePrefix = "r\x00"
	eqIndexKeySep        = "\x01"
	eqIndexMetaKeys      = "__meta|keys"
)

type pebbleEqIndexStore struct {
	root    string
	tableDB map[string]*pebble.DB
	mu      sync.RWMutex
	closed  bool
}

func newPebbleEqIndexStore(root string) (*pebbleEqIndexStore, error) {
	if strings.TrimSpace(root) == "" {
		return nil, fmt.Errorf("eq-index root empty")
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	log.Printf("RecordManager: SSD eq-index (Pebble) %s/{app}/{table}/", root)
	return &pebbleEqIndexStore{
		root:    root,
		tableDB: make(map[string]*pebble.DB),
	}, nil
}

func (s *pebbleEqIndexStore) tableKey(appID, tableName string) string {
	return appID + "/" + tableName
}

func (s *pebbleEqIndexStore) indexDB(appID, tableName string) (*pebble.DB, error) {
	key := s.tableKey(appID, tableName)

	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return nil, fmt.Errorf("eq-index shut down")
	}
	if db, ok := s.tableDB[key]; ok {
		s.mu.RUnlock()
		return db, nil
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, fmt.Errorf("eq-index shut down")
	}
	if db, ok := s.tableDB[key]; ok {
		return db, nil
	}

	path := filepath.Join(s.root, appID, tableName)
	if err := os.MkdirAll(path, 0o755); err != nil {
		return nil, err
	}
	db, err := pebble.Open(path, newIndexPebbleOptions())
	if err != nil {
		return nil, fmt.Errorf("open eq-index %s: %w", path, err)
	}
	s.tableDB[key] = db
	return db, nil
}

func eqForwardKey(fieldKey, pebbleKey string) []byte {
	return []byte(eqIndexForwardPrefix + fieldKey + eqIndexKeySep + pebbleKey)
}

func eqReverseKey(pebbleKey, fieldKey string) []byte {
	return []byte(eqIndexReversePrefix + pebbleKey + eqIndexKeySep + fieldKey)
}

func eqForwardPrefix(fieldKey string) []byte {
	return []byte(eqIndexForwardPrefix + fieldKey + eqIndexKeySep)
}

func eqReversePrefix(pebbleKey string) []byte {
	return []byte(eqIndexReversePrefix + pebbleKey + eqIndexKeySep)
}

func (s *pebbleEqIndexStore) readMetaCount(db *pebble.DB) int {
	val, closer, err := db.Get([]byte(eqIndexMetaKeys))
	if err != nil {
		return 0
	}
	defer closer.Close()
	n, _ := strconv.Atoi(string(val))
	if n < 0 {
		return 0
	}
	return n
}

func (s *pebbleEqIndexStore) adjustMetaCount(db *pebble.DB, delta int) {
	n := s.readMetaCount(db) + delta
	if n <= 0 {
		_ = db.Delete([]byte(eqIndexMetaKeys), pebble.Sync)
		return
	}
	_ = db.Set([]byte(eqIndexMetaKeys), []byte(strconv.Itoa(n)), pebble.Sync)
}

func (s *pebbleEqIndexStore) upsert(appID, tableName, pebbleKey string, record map[string]any) {
	if pebbleKey == "" || record == nil {
		return
	}
	db, err := s.indexDB(appID, tableName)
	if err != nil {
		log.Printf("eq-index upsert open failed %s/%s: %v", appID, tableName, err)
		return
	}

	hadKey := s.pebbleKeyIndexed(db, pebbleKey)
	if hadKey {
		s.deletePebbleKeyLocked(db, pebbleKey)
	}

	batch := db.NewBatch()
	var fieldKeys []string
	for field, value := range record {
		if !isIndexableEqField(field, value) {
			continue
		}
		norm := normalizeEqIndexValue(value)
		if norm == "" {
			continue
		}
		fk := fieldLookupKey(appID, tableName, field, norm)
		fieldKeys = append(fieldKeys, fk)
		_ = batch.Set(eqForwardKey(fk, pebbleKey), []byte{}, nil)
		_ = batch.Set(eqReverseKey(pebbleKey, fk), []byte{}, nil)
	}
	if len(fieldKeys) == 0 {
		_ = batch.Close()
		return
	}
	if err := batch.Commit(pebble.Sync); err != nil {
		log.Printf("eq-index upsert commit failed %s/%s: %v", appID, tableName, err)
	}
	if !hadKey {
		s.adjustMetaCount(db, 1)
	}
}

func (s *pebbleEqIndexStore) pebbleKeyIndexed(db *pebble.DB, pebbleKey string) bool {
	iter, err := db.NewIter(&pebble.IterOptions{
		LowerBound: eqReversePrefix(pebbleKey),
		UpperBound: append(eqReversePrefix(pebbleKey), 0xff),
	})
	if err != nil {
		return false
	}
	defer iter.Close()
	return iter.First()
}

func (s *pebbleEqIndexStore) deletePebbleKey(pebbleKey string) {
	if pebbleKey == "" {
		return
	}
	appID, tableName, _, err := ParsePebbleKey(pebbleKey)
	if err != nil {
		return
	}
	db, err := s.indexDB(appID, tableName)
	if err != nil {
		return
	}
	if s.deletePebbleKeyLocked(db, pebbleKey) {
		s.adjustMetaCount(db, -1)
	}
}

func (s *pebbleEqIndexStore) deletePebbleKeyLocked(db *pebble.DB, pebbleKey string) bool {
	iter, err := db.NewIter(&pebble.IterOptions{
		LowerBound: eqReversePrefix(pebbleKey),
		UpperBound: append(eqReversePrefix(pebbleKey), 0xff),
	})
	if err != nil {
		return false
	}
	defer iter.Close()

	var toDelete [][]byte
	for valid := iter.First(); valid; valid = iter.Next() {
		revKey := string(iter.Key())
		toDelete = append(toDelete, iter.Key())
		rest := strings.TrimPrefix(revKey, eqIndexReversePrefix)
		pebblePart, fieldKey, ok := strings.Cut(rest, eqIndexKeySep)
		if !ok || pebblePart == "" || fieldKey == "" {
			continue
		}
		toDelete = append(toDelete, eqForwardKey(fieldKey, pebblePart))
	}
	if len(toDelete) == 0 {
		return false
	}
	batch := db.NewBatch()
	for _, k := range toDelete {
		_ = batch.Delete(k, nil)
	}
	_ = batch.Commit(pebble.Sync)
	return true
}

func (s *pebbleEqIndexStore) deleteTable(appID, tableName string) {
	key := s.tableKey(appID, tableName)

	s.mu.Lock()
	defer s.mu.Unlock()
	if db, ok := s.tableDB[key]; ok {
		_ = db.Close()
		delete(s.tableDB, key)
	}
	path := filepath.Join(s.root, appID, tableName)
	_ = os.RemoveAll(path)
}

func (s *pebbleEqIndexStore) keys(appID, tableName, fieldName, fieldValue string, limit int) []string {
	if limit <= 0 {
		limit = maxEqIndexKeys
	}
	db, err := s.indexDB(appID, tableName)
	if err != nil {
		return nil
	}
	fieldKey := fieldLookupKey(appID, tableName, fieldName, fieldValue)
	iter, err := db.NewIter(&pebble.IterOptions{
		LowerBound: eqForwardPrefix(fieldKey),
		UpperBound: append(eqForwardPrefix(fieldKey), 0xff),
	})
	if err != nil {
		return nil
	}
	defer iter.Close()

	prefix := string(eqForwardPrefix(fieldKey))
	out := make([]string, 0, 8)
	for valid := iter.First(); valid; valid = iter.Next() {
		k := string(iter.Key())
		if !strings.HasPrefix(k, prefix) {
			break
		}
		pebbleKey := strings.TrimPrefix(k, prefix)
		if pebbleKey == "" {
			continue
		}
		out = append(out, pebbleKey)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func parsePebbleKeyFromReverseKey(key []byte) string {
	s := string(key)
	if !strings.HasPrefix(s, eqIndexReversePrefix) {
		return ""
	}
	rest := strings.TrimPrefix(s, eqIndexReversePrefix)
	if i := strings.Index(rest, eqIndexKeySep); i >= 0 {
		return rest[:i]
	}
	return rest
}

func (s *pebbleEqIndexStore) listTablePebbleKeys(appID, tableName string, offset, limit int) ([]string, int) {
	if limit <= 0 {
		limit = maxFilterTake
	}
	db, err := s.indexDB(appID, tableName)
	if err != nil {
		return nil, 0
	}
	total := s.readMetaCount(db)
	if total == 0 {
		return nil, 0
	}

	iter, err := db.NewIter(&pebble.IterOptions{
		LowerBound: []byte(eqIndexReversePrefix),
		UpperBound: append([]byte(eqIndexReversePrefix), 0xff),
	})
	if err != nil {
		return nil, total
	}
	defer iter.Close()

	out := make([]string, 0, limit)
	skipped := 0
	var lastPebbleKey string
	for valid := iter.First(); valid; valid = iter.Next() {
		pk := parsePebbleKeyFromReverseKey(iter.Key())
		if pk == "" || pk == lastPebbleKey {
			continue
		}
		lastPebbleKey = pk
		if skipped < offset {
			skipped++
			continue
		}
		out = append(out, pk)
		if len(out) >= limit {
			break
		}
	}
	return out, total
}

func (s *pebbleEqIndexStore) countTableKeys(appID, tableName string) int {
	db, err := s.indexDB(appID, tableName)
	if err != nil {
		return 0
	}
	return s.readMetaCount(db)
}

func (s *pebbleEqIndexStore) close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	for key, db := range s.tableDB {
		_ = db.Close()
		delete(s.tableDB, key)
	}
}
