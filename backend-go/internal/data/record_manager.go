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
	cfg        config.AppConfig
	dataDir    string
	pebbleRoot string
	tableDBs   map[string]*pebble.DB
	legacyDB   *pebble.DB
	searchDB   *sql.DB
	dbMu       sync.RWMutex
	legacyMu   sync.RWMutex
	closed     bool
}

func NewRecordManager(cfg config.AppConfig) (*RecordManager, error) {
	for _, dir := range []string{cfg.DataDir, cfg.NativeDataDir, cfg.SearchDBDir, cfg.PebbleRoot} {
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

	if searchDB, err := openSearchDB(cfg.SearchDBPath); err == nil {
		rm.searchDB = searchDB
		log.Printf("RecordManager: FTS search %s", cfg.SearchDBPath)
	} else if !os.IsNotExist(err) {
		log.Printf("RecordManager: FTS search unavailable (%v)", err)
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
	records := rm.collectFilteredRecords(appID, tableName, filter)
	total := len(records)
	start := offset
	if cursor != "" {
		for i, r := range records {
			if recordKey(r) == cursor {
				start = i
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
	if end < total {
		result["nextCursor"] = recordKey(records[end])
	}
	return result
}

func (rm *RecordManager) collectFilteredRecords(appID, tableName string, filter model.SearchFilter) []map[string]any {
	if rec := rm.tryFindByPKVariants(appID, tableName, filter); rec != nil {
		return []map[string]any{rec}
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
	keyBase := rm.buildPrimaryKey(app, table, record, pkFields)
	candidates := StorageKeyCandidates(app, table, keyBase)

	var existingKey string
	for _, c := range candidates {
		if _, err := rm.getRecordBytes(app, table, c); err == nil {
			existingKey = c
			break
		}
	}
	storageKey := keyBase
	cmd := "create"
	if existingKey != "" {
		storageKey = existingKey
		cmd = "update"
	}

	raw, err := json.Marshal(record)
	if err != nil {
		return "", err
	}
	if err := db.Set([]byte(storageKey), raw, pebble.Sync); err != nil {
		return "", err
	}
	rm.upsertSearchIndex(app, table, PebbleKey(app, table, storageKey), storageKey, record)
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
func (rm *RecordManager) FindByCustomPK(appID, tableName string, record map[string]any, pkFields []string) map[string]any {
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return nil
	}
	keyBase := rm.buildPrimaryKey(app, table, record, pkFields)
	if keyBase == "" {
		return nil
	}
	for _, candidate := range StorageKeyCandidates(app, table, keyBase) {
		val, err := rm.getRecordBytes(app, table, candidate)
		if err != nil {
			continue
		}
		var out map[string]any
		if json.Unmarshal(val, &out) == nil && len(out) > 0 {
			return out
		}
	}
	return nil
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
		if rec := rm.FindByCustomPK(appID, tableName, probe, fields); len(rec) > 0 && filter.Matches(rec) {
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
			probe := map[string]any{field: value}
			if rec := rm.FindByCustomPK(appID, tableName, probe, []string{field}); len(rec) != 0 && filter.Matches(rec) {
				return rec
			}
		}
	}
	return nil
}

func extractEqConditions(filter model.SearchFilter) map[string]any {
	out := make(map[string]any)
	extractEqConditionsInto(filter, out)
	return out
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

func (rm *RecordManager) GetTableStructField(appID, tableName, field string) []string {
	rec := rm.Find(appID, "index", model.EqFilter("id", tableName))
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
	db, err := rm.tableDB(app, table)
	if err != nil {
		return err
	}
	pkFields := rm.GetTablePKFields(app, table)
	keyBase := rm.buildPrimaryKey(app, table, record, pkFields)
	candidates := StorageKeyCandidates(app, table, keyBase)
	var deleted bool
	var deletedKey string
	for _, candidate := range candidates {
		if _, err := rm.getRecordBytes(app, table, candidate); err != nil {
			continue
		}
		if err := db.Delete([]byte(candidate), pebble.Sync); err != nil {
			return err
		}
		deletedKey = PebbleKey(app, table, candidate)
		deleted = true
		break
	}
	if !deleted {
		return fmt.Errorf("record not found for delete")
	}
	rm.deleteSearchIndex(deletedKey)
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
