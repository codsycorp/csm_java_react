package data

import (
	"encoding/json"
	"fmt"
	"strings"

	"csm_server/backend-go/internal/model"
)

const maxFTSEqKeysToCheck = 20

var strictNoScanFindFields = map[string]struct{}{
	"refresh_token": {},
	"refresh":       {},
	"app_token":     {},
}

var authLookupFields = map[string]struct{}{
	"email":            {},
	"username":         {},
	"phonenumber":      {},
	"phone":            {},
	"login_identifier": {},
}

func isAuthLookupField(field string) bool {
	_, ok := authLookupFields[strings.ToLower(strings.TrimSpace(field))]
	return ok
}

// tableAllowsPKOrphanScan limits full-table PK duplicate scans to sys_autos only.
// Java does not full-scan csm_accounts (or other tables) on every PK lookup — that caused multi-minute login.
func tableAllowsPKOrphanScan(tableName string) bool {
	return strings.EqualFold(strings.TrimSpace(tableName), "sys_autos")
}

func isStrictNoScanFindFilter(filter model.SearchFilter) bool {
	eq := extractEqConditions(filter)
	if len(eq) != 1 {
		return false
	}
	for field := range eq {
		_, ok := strictNoScanFindFields[strings.ToLower(strings.TrimSpace(field))]
		return ok
	}
	return false
}

func fieldInPKFields(field string, pkFields []string) bool {
	field = strings.TrimSpace(field)
	for _, pk := range pkFields {
		if strings.EqualFold(pk, field) {
			return true
		}
	}
	return false
}

// tryFindByDirectEqKey mirrors Java tryFindByDirectEqKey for id/app_token/refresh fields.
func (rm *RecordManager) tryFindByDirectEqKey(appID, tableName string, filter model.SearchFilter) map[string]any {
	eq := extractEqConditions(filter)
	if len(eq) != 1 {
		return nil
	}
	var field, value string
	for f, v := range eq {
		field = strings.TrimSpace(f)
		value = strings.TrimSpace(fmt.Sprint(v))
		break
	}
	if field == "" || value == "" {
		return nil
	}
	switch strings.ToLower(field) {
	case "id", "app_token", "refresh", "refresh_token":
	default:
		return nil
	}

	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}
	base := urlEncodeKey(value)
	for _, candidate := range StorageKeyCandidates(app, table, base) {
		raw, err := rm.getRecordBytes(app, table, candidate)
		if err != nil || len(raw) == 0 {
			continue
		}
		var record map[string]any
		if json.Unmarshal(raw, &record) != nil || !filter.Matches(record) {
			continue
		}
		return record
	}
	return nil
}

// tryFindByAuthFieldEq restores Java-style field equality lookup (email/username/phone/login_identifier)
// without the sys_autos-only PK orphan scan. Accounts are often stored under id keys, not field keys.
func (rm *RecordManager) tryFindByAuthFieldEq(appID, tableName string, filter model.SearchFilter) map[string]any {
	eq := extractEqConditions(filter)
	if len(eq) != 1 {
		return nil
	}
	var field, value string
	for f, v := range eq {
		field = strings.TrimSpace(f)
		value = strings.TrimSpace(fmt.Sprint(v))
		break
	}
	if !isAuthLookupField(field) || value == "" {
		return nil
	}

	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}

	base := urlEncodeKey(value)
	for _, candidate := range StorageKeyCandidates(app, table, base) {
		raw, err := rm.getRecordBytes(app, table, candidate)
		if err != nil || len(raw) == 0 {
			continue
		}
		var record map[string]any
		if json.Unmarshal(raw, &record) == nil && filter.Matches(record) {
			return record
		}
	}

	var found map[string]any
	_ = rm.scanTable(app, table, func(_ string, raw []byte) error {
		var record map[string]any
		if json.Unmarshal(raw, &record) == nil && filter.Matches(record) {
			found = record
			return errScanStop
		}
		return nil
	})
	return found
}

// tryFindByFTSEq mirrors Java tryFindByLuceneKeyCandidates for single eq filters (email, username, etc.).
func (rm *RecordManager) tryFindByFTSEq(appID, tableName string, filter model.SearchFilter) map[string]any {
	records := rm.collectViaFTSEq(appID, tableName, filter)
	if len(records) == 0 {
		return nil
	}
	return records[0]
}

func (rm *RecordManager) collectViaFTSEq(appID, tableName string, filter model.SearchFilter) []map[string]any {
	if !rm.searchEnabled() {
		return nil
	}
	eq := extractEqConditions(filter)
	if len(eq) != 1 {
		return nil
	}
	var term string
	for _, v := range eq {
		term = strings.TrimSpace(fmt.Sprint(v))
		break
	}
	if term == "" {
		return nil
	}

	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}

	match := buildFTSMatchQuery([]string{term})
	if match == "" {
		return nil
	}
	keys, err := rm.ftsSearchKeys(app, table, match, maxFTSEqKeysToCheck)
	if err != nil || len(keys) == 0 {
		return nil
	}

	seen := make(map[string]struct{})
	var records []map[string]any
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

// tryFindByTokenFieldEq scans auth tables for token fields when FTS is stale (app_token/refresh not yet indexed).
func (rm *RecordManager) tryFindByTokenFieldEq(appID, tableName string, filter model.SearchFilter) map[string]any {
	if !isAuthTokenTable(tableName) {
		return nil
	}
	eq := extractEqConditions(filter)
	if len(eq) != 1 {
		return nil
	}
	var field string
	for f := range eq {
		field = strings.ToLower(strings.TrimSpace(f))
		break
	}
	switch field {
	case "app_token", "refresh_token", "refresh":
	default:
		return nil
	}

	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}
	var found map[string]any
	_ = rm.scanTable(app, table, func(_ string, raw []byte) error {
		var record map[string]any
		if json.Unmarshal(raw, &record) == nil && filter.Matches(record) {
			found = record
			return errScanStop
		}
		return nil
	})
	return found
}

func isAuthTokenTable(tableName string) bool {
	switch strings.ToLower(strings.TrimSpace(tableName)) {
	case "csm_accounts", "csm_group_members":
		return true
	default:
		return false
	}
}

// isSingletonLookupFilter returns true when the filter targets at most one row (Find semantics).
// Java filter() never uses PK-variant short-circuit; partial PK like sys_autos p_type=0 is a list query.
func (rm *RecordManager) isSingletonLookupFilter(appID, tableName string, filter model.SearchFilter) bool {
	eq := extractEqConditions(filter)
	if len(eq) == 0 {
		return false
	}

	pkFields := rm.GetTablePKFields(appID, tableName)

	if len(eq) == 1 {
		var field string
		for f := range eq {
			field = strings.TrimSpace(f)
			break
		}
		fl := strings.ToLower(field)
		switch {
		case fl == "id":
			return true
		case fl == "app_token" || fl == "refresh_token" || fl == "refresh":
			return true
		case isAuthLookupField(field):
			return true
		case fieldInPKFields(field, pkFields):
			// Partial composite PK (e.g. only p_type) → list/filter, not singleton.
			return len(pkFields) <= 1
		default:
			return false
		}
	}

	if len(pkFields) == 0 {
		return false
	}
	for _, pk := range pkFields {
		v, ok := eq[pk]
		if !ok || v == nil || strings.TrimSpace(fmt.Sprint(v)) == "" {
			return false
		}
	}
	return true
}
