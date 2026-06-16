package data

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/cockroachdb/pebble"
	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
)

var errScanStop = errors.New("scan stop")

type RecordManager struct {
	cfg          config.AppConfig
	dataDir      string
	pebbleRoot   string
	tableDBs     map[string]*pebble.DB
	legacyDB     *pebble.DB
	searchDB     *sql.DB
	vectorStore  *VectorStore
	dbMu         sync.RWMutex
	legacyMu     sync.RWMutex
	closed       bool
}

func NewRecordManager(cfg config.AppConfig) (*RecordManager, error) {
	for _, dir := range []string{cfg.DataDir, cfg.NativeDataDir, cfg.SearchDBDir, cfg.PebbleRoot, cfg.VectorStoreDir} {
		if strings.TrimSpace(dir) == "" {
			continue
		}
		if err := config.EnsureDir(dir); err != nil {
			return nil, fmt.Errorf("ensure dir %s: %w", dir, err)
		}
	}

	rm := &RecordManager{
		cfg:        cfg,
		dataDir:    cfg.DataDir,
		pebbleRoot: cfg.PebbleRoot,
		tableDBs:   make(map[string]*pebble.DB),
	}

	if cfg.PebbleLegacy != "" {
		if _, err := os.Stat(cfg.PebbleLegacy); err == nil {
			legacy, err := pebble.Open(cfg.PebbleLegacy, &pebble.Options{ReadOnly: true})
			if err != nil {
				log.Printf("RecordManager: legacy Pebble read-only open failed (%v) — ignoring", err)
			} else {
				rm.legacyDB = legacy
				log.Printf("RecordManager: legacy monolithic Pebble (read fallback) %s", cfg.PebbleLegacy)
			}
		}
	}

	if vs, err := openVectorStore(cfg); err != nil {
		log.Printf("RecordManager: vector store unavailable (%v)", err)
	} else {
		rm.vectorStore = vs
	}

	// Search index (FTS + eq field index) — always ensure DB exists for fast filtered reads.
	if searchDB, err := ensureSearchDB(cfg.SearchDBPath); err == nil {
		rm.searchDB = searchDB
		log.Printf("RecordManager: search index %s (FTS + eq)", cfg.SearchDBPath)
	} else {
		log.Printf("RecordManager: search index unavailable (%v)", err)
	}
	log.Printf("RecordManager: Pebble root %s/{app_id}/{table_name}/ (pure Go, no RocksDB/CGO)", cfg.PebbleRoot)
	return rm, nil
}

func (rm *RecordManager) Init() {
	log.Printf("RecordManager initialized: data_dir=%s", rm.dataDir)
}

func (rm *RecordManager) ShutdownAll() {
	rm.dbMu.Lock()
	defer rm.dbMu.Unlock()
	if rm.closed {
		return
	}
	rm.closed = true
	for key, db := range rm.tableDBs {
		_ = db.Close()
		delete(rm.tableDBs, key)
	}
	rm.legacyMu.Lock()
	if rm.legacyDB != nil {
		_ = rm.legacyDB.Close()
		rm.legacyDB = nil
	}
	rm.legacyMu.Unlock()
	if rm.searchDB != nil {
		_ = rm.searchDB.Close()
		rm.searchDB = nil
	}
	if rm.vectorStore != nil {
		rm.vectorStore.Close()
		rm.vectorStore = nil
	}
	log.Println("Pebble stores closed")
}

func (rm *RecordManager) sanitizeSegment(segment, label string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(segment))
	if s == "" {
		return "", fmt.Errorf("%s cannot be empty", label)
	}
	if strings.ContainsAny(s, "/\\\x00") || s == "." || s == ".." || strings.Contains(s, "..") {
		return "", fmt.Errorf("%s contains invalid path characters: %s", label, segment)
	}
	return s, nil
}

func (rm *RecordManager) Find(appID, tableName string, filter model.SearchFilter) map[string]any {
	if rec := rm.tryFindByPKVariants(appID, tableName, filter); rec != nil {
		return rec
	}
	if rec := rm.tryFindByDirectEqKey(appID, tableName, filter); rec != nil {
		return rec
	}
	if rec := rm.tryFindByAuthFieldEq(appID, tableName, filter); rec != nil {
		return rec
	}
	if rec := rm.tryFindByFTSEq(appID, tableName, filter); rec != nil {
		return rec
	}
	if rec := rm.tryFindByTokenFieldEq(appID, tableName, filter); rec != nil {
		return rec
	}
	if isStrictNoScanFindFilter(filter) {
		return map[string]any{}
	}
	if rec := rm.tryFindByScan(appID, tableName, filter); rec != nil {
		return rec
	}
	return map[string]any{}
}

func (rm *RecordManager) Filter(appID, tableName string, filter model.SearchFilter) map[string]any {
	records := rm.collectFilteredRecords(appID, tableName, filter)
	rows := make([]any, 0, len(records))
	for _, r := range records {
		rows = append(rows, r)
	}
	return map[string]any{
		"rows":       rows,
		"data":       rows,
		"totalCount": len(rows),
	}
}

func (rm *RecordManager) FilterWithPagination(
	appID, tableName string,
	filter model.SearchFilter,
	cursor string,
	offset, take int,
) map[string]any {
	if take <= 0 {
		take = DefaultFilterTake
	}
	if take > maxFilterTake {
		take = maxFilterTake
	}

	if rm.isSingletonLookupFilter(appID, tableName, filter) {
		records := rm.collectFilteredRecords(appID, tableName, filter)
		total := len(records)
		start := offset
		if cursor != "" {
			for i, r := range records {
				if recordKey(r) == cursor {
					start = i + 1
					break
				}
			}
		}
		end := start + take
		if end > total {
			end = total
		}
		slice := make([]any, 0, end-start)
		for _, r := range records[start:end] {
			slice = append(slice, r)
		}
		result := map[string]any{
			"rows":       slice,
			"data":       slice,
			"totalCount": total,
		}
		if end < total && end > start {
			result["nextCursor"] = recordKey(records[end-1])
		}
		return result
	}

	if rm.searchEnabled() && !filter.HasLike() {
		if keys := rm.searchKeysConsistent(appID, tableName, filter); len(keys) > 0 {
			return rm.paginatePebbleKeys(keys, filter, cursor, offset, take)
		}
	}

	if rm.searchEnabled() && filter.HasLike() {
		terms := filter.CollectLikeTerms()
		match := buildFTSMatchQuery(terms)
		if match != "" {
			app, table, err := rm.sanitizeTable(appID, tableName)
			if err == nil {
				if keys, err := rm.ftsSearchKeys(app, table, match, maxFTSCandidateKeys); err == nil && len(keys) > 0 {
					return rm.paginatePebbleKeys(keys, filter, cursor, offset, take)
				}
			}
		}
	}

	return rm.filterWithPaginationScan(appID, tableName, filter, cursor, offset, take)
}

func (rm *RecordManager) collectFilteredRecords(appID, tableName string, filter model.SearchFilter) []map[string]any {
	if rm.isSingletonLookupFilter(appID, tableName, filter) {
		if rec := rm.tryFindByPKVariants(appID, tableName, filter); rec != nil {
			return []map[string]any{rec}
		}
		if rec := rm.tryFindByDirectEqKey(appID, tableName, filter); rec != nil {
			return []map[string]any{rec}
		}
		if rec := rm.tryFindByAuthFieldEq(appID, tableName, filter); rec != nil {
			return []map[string]any{rec}
		}
		if records := rm.collectViaFTSEq(appID, tableName, filter); len(records) > 0 {
			return records
		}
		if rec := rm.tryFindByTokenFieldEq(appID, tableName, filter); rec != nil {
			return []map[string]any{rec}
		}
	}

	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		log.Printf("invalid table %s/%s: %v", appID, tableName, err)
		return nil
	}

	if rm.searchEnabled() && filter.HasLike() {
		if records := rm.collectViaFTS(app, table, filter); len(records) > 0 {
			return records
		}
		// FTS miss (domain/status SSR filters) → full Pebble scan like Rust collect_filtered_records.
	}

	if rm.searchEnabled() && !filter.HasLike() {
		if records := rm.collectViaEqIndex(appID, tableName, filter); len(records) > 0 {
			return records
		}
	}

	if isStrictNoScanFindFilter(filter) {
		return nil
	}

	seen := make(map[string]struct{})
	var records []map[string]any
	err = rm.scanTable(app, table, func(storageKey string, raw []byte) error {
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
		log.Printf("scan table %s/%s: %v", app, table, err)
	}
	return records
}

func (rm *RecordManager) tryFindByScan(appID, tableName string, filter model.SearchFilter) map[string]any {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}
	var found map[string]any
	err = rm.scanTable(app, table, func(_ string, raw []byte) error {
		var record map[string]any
		if json.Unmarshal(raw, &record) == nil && filter.Matches(record) {
			found = record
			return errScanStop
		}
		return nil
	})
	if err != nil && !errors.Is(err, errScanStop) {
		log.Printf("scan table %s/%s: %v", app, table, err)
	}
	return found
}

func (rm *RecordManager) CreateRecord(appID, tableName string, record map[string]any, customPK []string) (string, error) {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return "", err
	}
	db, err := rm.tableDB(app, table)
	if err != nil {
		return "", err
	}

	pkFields := customPK
	if len(pkFields) == 0 {
		pkFields = []string{"id"}
	}

	rm.ensureRecordID(table, record)

	canonicalKey := rm.buildPrimaryKey(app, table, record, pkFields)
	keyByID := rm.resolveStorageKeyByID(app, table, record)

	cmd := "create"
	if len(pkFields) > 0 && canonicalKey != "" {
		if tableAllowsPKOrphanScan(table) {
			if len(rm.findAllByCustomPK(app, table, record, pkFields)) > 0 {
				cmd = "update"
			}
		} else if rm.hasAnyPKStorage(app, table, canonicalKey, keyByID) {
			cmd = "update"
		}
	} else if rm.hasAnyPKStorage(app, table, canonicalKey, keyByID) {
		cmd = "update"
	}

	raw, err := json.Marshal(record)
	if err != nil {
		return "", err
	}

	batch := db.NewBatch()
	defer batch.Close()

	// Java: migrate non-canonical key resolved by id before consolidating aliases.
	if cmd == "update" && keyByID != "" && keyByID != canonicalKey {
		batch.Delete([]byte(keyByID), nil)
		rm.deleteSearchIndex(PebbleKey(app, table, keyByID))
	}

	rm.consolidatePKStorageKeys(app, table, canonicalKey, record, pkFields, batch)

	if err := batch.Set([]byte(canonicalKey), raw, nil); err != nil {
		return "", err
	}
	if err := batch.Commit(pebble.Sync); err != nil {
		return "", err
	}
	if cmd == "create" {
		rm.incrementMetaCount(db)
	}

	rm.deleteLegacyPKAliases(app, table, canonicalKey)
	rm.upsertSearchIndex(app, table, PebbleKey(app, table, canonicalKey), canonicalKey, record)
	return cmd, nil
}

func urlEncodeKey(input string) string {
	return url.QueryEscape(input)
}

// buildPrimaryKey mirrors Java generateKey / Rust generate_key_suffix (URL-encoded PK values joined by ":").
func (rm *RecordManager) buildPrimaryKey(_appID, _tableName string, record map[string]any, pkFields []string) string {
	if len(pkFields) == 0 {
		return ""
	}
	parts := make([]string, 0, len(pkFields))
	allEmpty := true
	for _, f := range pkFields {
		raw := ""
		if v, ok := record[f]; ok && v != nil {
			raw = fmt.Sprint(v)
		}
		if raw != "" {
			allEmpty = false
		}
		parts = append(parts, urlEncodeKey(raw))
	}
	if allEmpty {
		return ""
	}
	return strings.Join(parts, ":")
}

// FindByCustomPK reads a row by explicit PK fields (Java createRecord custom PK / Rust find_by_custom_pk).
// When legacy migration left duplicate storage keys for the same PK, all candidates are collected and
// the best row is returned (per-table store wins; then longest p_code — matches editor full-scan behavior).
func (rm *RecordManager) FindByCustomPK(appID, tableName string, record map[string]any, pkFields []string) map[string]any {
	hits := rm.findAllByCustomPK(appID, tableName, record, pkFields)
	return rm.pickBestPKHit(hits)
}

type pkCandidateHit struct {
	storageKey string
	record     map[string]any
	inPerTable bool
}

func (rm *RecordManager) findAllByCustomPK(appID, tableName string, probe map[string]any, pkFields []string) []pkCandidateHit {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}
	keyBase := rm.buildPrimaryKey(app, table, probe, pkFields)
	if keyBase == "" {
		return nil
	}

	var hits []pkCandidateHit
	seenStorage := make(map[string]struct{})
	for _, candidate := range StorageKeyCandidates(app, table, keyBase) {
		if _, ok := seenStorage[candidate]; ok {
			continue
		}
		seenStorage[candidate] = struct{}{}

		var raw []byte
		inPerTable := false
		if db, err := rm.tableDB(app, table); err == nil {
			if val, closer, err := db.Get([]byte(candidate)); err == nil {
				raw = append([]byte(nil), val...)
				inPerTable = true
				closer.Close()
			}
		}
		if raw == nil {
			rm.legacyMu.RLock()
			legacy := rm.legacyDB
			rm.legacyMu.RUnlock()
			if legacy != nil {
				for _, legacyKey := range StorageKeyCandidates(app, table, candidate) {
					canonical := PebbleKey(app, table, legacyKey)
					if val, closer, err := legacy.Get([]byte(canonical)); err == nil {
						raw = append([]byte(nil), val...)
						closer.Close()
						break
					}
				}
			}
		}
		if raw == nil {
			continue
		}
		var out map[string]any
		if json.Unmarshal(raw, &out) != nil || len(out) == 0 {
			continue
		}
		if !recordMatchesPK(out, probe, pkFields) {
			continue
		}
		hits = append(hits, pkCandidateHit{storageKey: candidate, record: out, inPerTable: inPerTable})
	}
	if tableAllowsPKOrphanScan(table) {
		rm.appendPKMatchesFromTableScan(app, table, probe, pkFields, seenStorage, &hits)
	}
	return hits
}

// appendPKMatchesFromTableScan finds PK duplicates stored under non-canonical keys (e.g. Java id keys)
// that StorageKeyCandidates does not cover. Limited to sys_autos — other tables use direct key / FTS paths.
func (rm *RecordManager) appendPKMatchesFromTableScan(
	app, table string,
	probe map[string]any,
	pkFields []string,
	seenStorage map[string]struct{},
	hits *[]pkCandidateHit,
) {
	_ = rm.scanTable(app, table, func(storageKey string, raw []byte) error {
		if _, ok := seenStorage[storageKey]; ok {
			return nil
		}
		var out map[string]any
		if json.Unmarshal(raw, &out) != nil || len(out) == 0 {
			return nil
		}
		if !recordMatchesPK(out, probe, pkFields) {
			return nil
		}
		seenStorage[storageKey] = struct{}{}
		*hits = append(*hits, pkCandidateHit{storageKey: storageKey, record: out, inPerTable: true})
		return nil
	})
}

func recordMatchesPK(record, probe map[string]any, pkFields []string) bool {
	for _, pk := range pkFields {
		pv, ok := probe[pk]
		if !ok {
			continue
		}
		if !model.ValuesEqual(record[pk], pv) {
			return false
		}
	}
	return true
}

func (rm *RecordManager) pickBestPKHit(hits []pkCandidateHit) map[string]any {
	if len(hits) == 0 {
		return nil
	}
	if len(hits) == 1 {
		return hits[0].record
	}
	best := hits[0]
	for _, h := range hits[1:] {
		if h.inPerTable && !best.inPerTable {
			best = h
			continue
		}
		if h.inPerTable != best.inPerTable {
			continue
		}
		if codeLen(h.record) > codeLen(best.record) {
			best = h
		}
	}
	return best.record
}

func codeLen(record map[string]any) int {
	if record == nil {
		return 0
	}
	return len(fmt.Sprint(record["p_code"]))
}

func (rm *RecordManager) tryFindByPKVariants(appID, tableName string, filter model.SearchFilter) map[string]any {
	eq := extractEqConditions(filter)
	if len(eq) == 0 {
		return nil
	}

	if strings.EqualFold(tableName, "index") {
		if id, ok := eq["id"]; ok {
			probe := map[string]any{"id": id}
			if rec := rm.FindByCustomPK(appID, tableName, probe, []string{"id"}); len(rec) > 0 && filter.Matches(rec) {
				return rec
			}
		}
		return nil
	}

	pkFields := rm.GetTablePKFields(appID, tableName)
	present := make([]string, 0, len(pkFields))
	for _, pk := range pkFields {
		if v, ok := eq[pk]; ok && v != nil && fmt.Sprint(v) != "" {
			present = append(present, pk)
		}
	}

	tryProbe := func(fields []string) map[string]any {
		if len(fields) == 0 {
			return nil
		}
		probe := make(map[string]any, len(fields))
		for _, pk := range fields {
			if v, ok := eq[pk]; ok {
				probe[pk] = v
			} else {
				probe[pk] = ""
			}
		}
		rec := rm.FindByCustomPK(appID, tableName, probe, fields)
		if len(rec) > 0 && pkProbeMatchesFilter(rec, filter, eq, fields) {
			return rec
		}
		return nil
	}

	if rec := tryProbe(present); rec != nil {
		return rec
	}
	if len(present) != len(pkFields) {
		if rec := tryProbe(pkFields); rec != nil {
			return rec
		}
	}

	if len(eq) == 1 {
		for field, value := range eq {
			if isAuthLookupField(field) {
				if rec := rm.tryFindByAuthFieldEq(appID, tableName, filter); rec != nil {
					return rec
				}
				continue
			}
			if !tableAllowsPKOrphanScan(tableName) && !fieldInPKFields(field, pkFields) && !strings.EqualFold(field, "id") {
				continue
			}
			probe := map[string]any{field: value}
			if rec := rm.FindByCustomPK(appID, tableName, probe, []string{field}); len(rec) != 0 && filter.Matches(rec) {
				return rec
			}
		}
	}
	return nil
}

// ExtractEqConditions collects eq field→value pairs from a filter tree.
func ExtractEqConditions(filter model.SearchFilter) map[string]any {
	return extractEqConditions(filter)
}

func extractEqConditions(filter model.SearchFilter) map[string]any {
	out := make(map[string]any)
	extractEqConditionsInto(filter, out)
	return out
}

// pkProbeMatchesFilter accepts a PK hit even when extra AND conditions (e.g. stale id) do not match.
func pkProbeMatchesFilter(record map[string]any, filter model.SearchFilter, eq map[string]any, pkFields []string) bool {
	if filter.Matches(record) {
		return true
	}
	if len(pkFields) == 0 {
		return false
	}
	for _, pk := range pkFields {
		ev, ok := eq[pk]
		if !ok {
			continue
		}
		if !model.ValuesEqual(record[pk], ev) {
			return false
		}
	}
	return true
}

func extractEqConditionsInto(filter model.SearchFilter, out map[string]any) {
	if len(filter.Conditions) > 0 {
		for _, sub := range filter.Conditions {
			extractEqConditionsInto(sub, out)
		}
		return
	}
	if strings.EqualFold(filter.FilterType, "eq") && filter.Field != "" {
		out[filter.Field] = filter.Value
	}
}

func (rm *RecordManager) sanitizeTable(appID, tableName string) (string, string, error) {
	app, err := rm.sanitizeSegment(appID, "app_id")
	if err != nil {
		return "", "", err
	}
	table, err := rm.sanitizeSegment(tableName, "table_name")
	if err != nil {
		return "", "", err
	}
	return app, table, nil
}

func recordKey(record map[string]any) string {
	if v, ok := record["id"]; ok {
		return fmt.Sprint(v)
	}
	return ""
}

func (rm *RecordManager) CreateTable(params map[string]any) map[string]any {
	appID, _ := params["app_id"].(string)
	if appID == "" {
		appID = "default"
	}
	tableName, _ := params["obj_name"].(string)
	if _, _, err := rm.sanitizeTable(appID, tableName); err != nil {
		return map[string]any{"success": false, "message": err.Error()}
	}
	return map[string]any{"success": true, "message": fmt.Sprintf("Table %s ready", tableName)}
}

func (rm *RecordManager) FullScan(appID, tableName string) map[string]any {
	records := rm.collectFilteredRecords(appID, tableName, model.SearchFilter{})
	rows := make([]any, 0, len(records))
	for _, r := range records {
		rows = append(rows, r)
	}
	return map[string]any{"data": rows}
}

func (rm *RecordManager) GetTablePKFields(appID, tableName string) []string {
	if strings.EqualFold(tableName, "index") {
		return []string{"id"}
	}
	pk := rm.GetTableStructField(appID, tableName, "fieldsPK")
	if len(pk) == 0 {
		return []string{"id"}
	}
	return pk
}

func (rm *RecordManager) FindIndexTableCached(appID, tableName string) map[string]any {
	return rm.findIndexTableCached(appID, tableName)
}

func (rm *RecordManager) GetTableStructField(appID, tableName, field string) []string {
	rec := rm.findIndexTableCached(appID, tableName)
	structMap, ok := rec["struct"].(map[string]any)
	if !ok {
		return nil
	}
	raw, ok := structMap[field]
	if !ok {
		return nil
	}
	switch arr := raw.(type) {
	case []any:
		out := make([]string, 0, len(arr))
		for _, item := range arr {
			if s, ok := item.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return arr
	default:
		return nil
	}
}

func (rm *RecordManager) FindExistingByPK(appID, tableName string, record map[string]any) map[string]any {
	pkFields := rm.GetTablePKFields(appID, tableName)
	keyBase := rm.buildPrimaryKey(appID, tableName, record, pkFields)
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}
	for _, candidate := range StorageKeyCandidates(app, table, keyBase) {
		val, err := rm.getRecordBytes(app, table, candidate)
		if err != nil {
			continue
		}
		var out map[string]any
		_ = json.Unmarshal(val, &out)
		if len(out) > 0 {
			return out
		}
	}
	return nil
}

func (rm *RecordManager) DeleteRecord(appID, tableName string, record map[string]any) error {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return err
	}
	pkFields := rm.GetTablePKFields(app, table)
	keysToDelete := rm.collectStorageKeysToDelete(appID, tableName, record, pkFields)

	deletedAny := false
	for _, storageKey := range keysToDelete {
		if rm.deleteAtStorageKey(app, table, storageKey) {
			deletedAny = true
		}
	}
	if !deletedAny {
		return fmt.Errorf("record not found for delete")
	}
	return nil
}

func (rm *RecordManager) DropTable(params map[string]any) map[string]any {
	appID, _ := params["app_id"].(string)
	if appID == "" {
		appID = "default"
	}
	tableName, _ := params["obj_name"].(string)
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return map[string]any{"success": false, "message": err.Error()}
	}

	path, err := rm.tableDBPath(app, table)
	if err != nil {
		return map[string]any{"success": false, "message": err.Error()}
	}
	rm.closeTableDB(app, table)
	rm.deleteSearchIndexForTable(app, table)

	if err := os.RemoveAll(path); err != nil && !os.IsNotExist(err) {
		return map[string]any{"success": false, "message": err.Error()}
	}
	return map[string]any{
		"success": true,
		"message": fmt.Sprintf("Dropped %s/%s", app, table),
	}
}
