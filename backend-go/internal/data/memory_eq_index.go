package data

import (
	"sync"
	"time"
)

type eqIndexStore struct {
	mu           sync.RWMutex
	lookup       map[string]map[string]struct{}
	pebbleFields map[string][]string
	tableKeys    map[string]map[string]struct{}
}

func newEqIndexStore() *eqIndexStore {
	return &eqIndexStore{
		lookup:       make(map[string]map[string]struct{}),
		pebbleFields: make(map[string][]string),
		tableKeys:    make(map[string]map[string]struct{}),
	}
}

func fieldLookupKey(appID, tableName, fieldName, fieldValue string) string {
	return appID + "\x00" + tableName + "\x00" + fieldName + "\x00" + fieldValue
}

func tableLookupKey(appID, tableName string) string {
	return appID + "\x00" + tableName
}

func (s *eqIndexStore) upsert(appID, tableName, pebbleKey string, record map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deletePebbleKeyLocked(pebbleKey)

	tk := tableLookupKey(appID, tableName)
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
		if s.lookup[fk] == nil {
			s.lookup[fk] = make(map[string]struct{})
		}
		s.lookup[fk][pebbleKey] = struct{}{}
		if s.tableKeys[tk] == nil {
			s.tableKeys[tk] = make(map[string]struct{})
		}
		s.tableKeys[tk][pebbleKey] = struct{}{}
	}
	if len(fieldKeys) > 0 {
		s.pebbleFields[pebbleKey] = fieldKeys
	}
}

func (s *eqIndexStore) deletePebbleKey(pebbleKey string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deletePebbleKeyLocked(pebbleKey)
}

func (s *eqIndexStore) deletePebbleKeyLocked(pebbleKey string) {
	fieldKeys, ok := s.pebbleFields[pebbleKey]
	if !ok {
		return
	}
	for _, fk := range fieldKeys {
		if keys, ok := s.lookup[fk]; ok {
			delete(keys, pebbleKey)
			if len(keys) == 0 {
				delete(s.lookup, fk)
			}
		}
	}
	delete(s.pebbleFields, pebbleKey)
	for tk, keys := range s.tableKeys {
		if _, ok := keys[pebbleKey]; ok {
			delete(keys, pebbleKey)
			if len(keys) == 0 {
				delete(s.tableKeys, tk)
			}
			break
		}
	}
}

func (s *eqIndexStore) deleteTable(appID, tableName string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tk := tableLookupKey(appID, tableName)
	keys := s.tableKeys[tk]
	for pebbleKey := range keys {
		s.deletePebbleKeyLocked(pebbleKey)
	}
	delete(s.tableKeys, tk)
}

func (s *eqIndexStore) keys(appID, tableName, fieldName, fieldValue string, limit int) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if limit <= 0 {
		limit = maxEqIndexKeys
	}
	set := s.lookup[fieldLookupKey(appID, tableName, fieldName, fieldValue)]
	if len(set) == 0 {
		return nil
	}
	out := make([]string, 0, len(set))
	for pebbleKey := range set {
		out = append(out, pebbleKey)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func (s *eqIndexStore) countTableKeys(appID, tableName string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.tableKeys[tableLookupKey(appID, tableName)])
}

type searchMetaEntry struct {
	pebbleRows  int
	indexedKeys int
	rebuiltAt   int64
	complete    bool
}

type searchMetaStore struct {
	mu     sync.RWMutex
	tables map[string]searchMetaEntry
}

func newSearchMetaStore() *searchMetaStore {
	return &searchMetaStore{tables: make(map[string]searchMetaEntry)}
}

func (s *searchMetaStore) isComplete(appID, tableName string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.tables[tableLookupKey(appID, tableName)]
	return ok && entry.complete
}

func (s *searchMetaStore) markComplete(appID, tableName string, pebbleRows, indexedKeys int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tables[tableLookupKey(appID, tableName)] = searchMetaEntry{
		pebbleRows:  pebbleRows,
		indexedKeys: indexedKeys,
		rebuiltAt:   time.Now().Unix(),
		complete:    true,
	}
}

func (s *searchMetaStore) markIncomplete(appID, tableName string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tables[tableLookupKey(appID, tableName)] = searchMetaEntry{complete: false}
}
