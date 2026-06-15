package data

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestFindByCustomPK_PrefersNewerDuplicateOverStaleCanonical(t *testing.T) {
	rm := testRecordManager(t)
	app, table := "csm", "sys_autos"

	crmTemplate := map[string]any{
		"id":     "crm-canonical-id",
		"p_name": "broadcast_wuweb",
		"p_type": float64(0),
		"p_code": strings.Repeat("CRM-Workspace-Template-", 12000), // ~400KB class
	}
	autoLmkt := map[string]any{
		"id":     "auto-lmkt-editor-id",
		"p_name": "broadcast_wuweb",
		"p_type": float64(0),
		"p_code": strings.Repeat("AUTO-LMKT-NEW-CODE-", 50000), // ~1MB class
	}

	keyBase := "broadcast_wuweb:0"
	legacyKey := StorageKeyCandidates(app, table, keyBase)[1]

	db, err := rm.tableDB(app, table)
	if err != nil {
		t.Fatalf("tableDB: %v", err)
	}
	rawCRM, _ := json.Marshal(crmTemplate)
	rawLmkt, _ := json.Marshal(autoLmkt)
	if err := db.Set([]byte(keyBase), rawCRM, nil); err != nil {
		t.Fatalf("seed canonical CRM: %v", err)
	}
	if err := db.Set([]byte(legacyKey), rawLmkt, nil); err != nil {
		t.Fatalf("seed legacy auto-lmkt: %v", err)
	}

	read := rm.FindByCustomPK(app, table, map[string]any{
		"p_name": "broadcast_wuweb",
		"p_type": float64(0),
	}, []string{"p_name", "p_type"})

	if got := read["id"]; got != "auto-lmkt-editor-id" {
		t.Fatalf("FindByCustomPK id = %v, want auto-lmkt-editor-id (homepage path)", got)
	}
	if got := codeLen(read); got <= codeLen(crmTemplate) {
		t.Fatalf("FindByCustomPK p_code len = %d, want larger than CRM template %d", got, codeLen(crmTemplate))
	}
}

func TestCreateRecord_ConsolidatesDuplicateStorageKeysOnSave(t *testing.T) {
	rm := testRecordManager(t)
	app, table := "csm", "sys_autos"

	staleCRM := map[string]any{
		"id":     "crm-canonical-id",
		"p_name": "broadcast_wuweb",
		"p_type": float64(0),
		"p_code": "CRM-OLD",
	}
	saved := map[string]any{
		"id":     "auto-lmkt-id",
		"p_name": "broadcast_wuweb",
		"p_type": float64(0),
		"p_code": strings.Repeat("AUTO-LMKT-", 1000),
	}

	keyBase := "broadcast_wuweb:0"
	legacyKey := StorageKeyCandidates(app, table, keyBase)[1]

	db, err := rm.tableDB(app, table)
	if err != nil {
		t.Fatalf("tableDB: %v", err)
	}
	rawCRM, _ := json.Marshal(staleCRM)
	rawSaved, _ := json.Marshal(saved)
	if err := db.Set([]byte(keyBase), rawCRM, nil); err != nil {
		t.Fatalf("seed canonical CRM: %v", err)
	}
	if err := db.Set([]byte(legacyKey), rawSaved, nil); err != nil {
		t.Fatalf("seed legacy auto-lmkt: %v", err)
	}

	if _, err := rm.CreateRecord(app, table, saved, []string{"p_name", "p_type"}); err != nil {
		t.Fatalf("CreateRecord: %v", err)
	}

	read := rm.FindByCustomPK(app, table, map[string]any{
		"p_name": "broadcast_wuweb",
		"p_type": float64(0),
	}, []string{"p_name", "p_type"})
	if got := read["p_code"]; got != saved["p_code"] {
		t.Fatalf("FindByCustomPK p_code mismatch after consolidate")
	}
	if _, err := rm.getRecordBytes(app, table, legacyKey); err == nil {
		t.Fatalf("legacy alias key still present after save: %s", legacyKey)
	}
}

func TestCreateRecord_ConsolidatesDuplicateStorageKeys(t *testing.T) {
	rm := testRecordManager(t)

	oldRecord := map[string]any{
		"id":     "legacy-id-old",
		"p_name": "broadcast_demo",
		"p_type": float64(0),
		"p_code": "OLD-CRM-TEMPLATE-CODE",
	}
	newRecord := map[string]any{
		"id":     "editor-id-new",
		"p_name": "broadcast_demo",
		"p_type": float64(0),
		"p_code": "USER-SAVED-NEW-CODE",
	}

	app, table := "csm", "sys_autos"
	keyBase := rm.buildPrimaryKey(app, table, oldRecord, []string{"p_name", "p_type"})
	legacyKey := StorageKeyCandidates(app, table, keyBase)[1]

	db, err := rm.tableDB(app, table)
	if err != nil {
		t.Fatalf("tableDB: %v", err)
	}
	rawOld, _ := json.Marshal(oldRecord)
	if err := db.Set([]byte(legacyKey), rawOld, nil); err != nil {
		t.Fatalf("seed legacy key: %v", err)
	}

	if _, err := rm.CreateRecord(app, table, newRecord, []string{"p_name", "p_type"}); err != nil {
		t.Fatalf("CreateRecord: %v", err)
	}

	read := rm.FindByCustomPK(app, table, map[string]any{
		"p_name": "broadcast_demo",
		"p_type": float64(0),
	}, []string{"p_name", "p_type"})
	if got := read["p_code"]; got != "USER-SAVED-NEW-CODE" {
		t.Fatalf("FindByCustomPK p_code = %v, want USER-SAVED-NEW-CODE", got)
	}
	if got := read["id"]; got != "editor-id-new" {
		t.Fatalf("FindByCustomPK id = %v, want editor-id-new", got)
	}

	for _, candidate := range StorageKeyCandidates(app, table, keyBase) {
		if candidate == keyBase {
			continue
		}
		if _, err := rm.getRecordBytes(app, table, candidate); err == nil {
			t.Fatalf("duplicate storage key still present after consolidate save: %s", candidate)
		}
	}
}

func TestCreateRecord_UpdateByIDWhenPKPointsToDifferentCopy(t *testing.T) {
	rm := testRecordManager(t)

	app, table := "csm", "sys_autos"
	canonical := map[string]any{
		"id":     "canonical-copy",
		"p_name": "broadcast_demo",
		"p_type": float64(0),
		"p_code": "OLD-CRM-TEMPLATE-CODE",
	}
	editorCopy := map[string]any{
		"id":     "editor-selected-id",
		"p_name": "broadcast_demo",
		"p_type": float64(0),
		"p_code": "USER-SAVED-NEW-CODE",
	}

	keyBase := rm.buildPrimaryKey(app, table, canonical, []string{"p_name", "p_type"})
	legacyKey := StorageKeyCandidates(app, table, keyBase)[1]

	db, err := rm.tableDB(app, table)
	if err != nil {
		t.Fatalf("tableDB: %v", err)
	}
	rawCanonical, _ := json.Marshal(canonical)
	rawEditor, _ := json.Marshal(editorCopy)
	if err := db.Set([]byte(keyBase), rawCanonical, nil); err != nil {
		t.Fatalf("seed canonical: %v", err)
	}
	if err := db.Set([]byte(legacyKey), rawEditor, nil); err != nil {
		t.Fatalf("seed legacy: %v", err)
	}

	if _, err := rm.CreateRecord(app, table, editorCopy, []string{"p_name", "p_type"}); err != nil {
		t.Fatalf("CreateRecord: %v", err)
	}

	read := rm.FindByCustomPK(app, table, map[string]any{
		"p_name": "broadcast_demo",
		"p_type": float64(0),
	}, []string{"p_name", "p_type"})
	if got := read["p_code"]; got != "USER-SAVED-NEW-CODE" {
		t.Fatalf("FindByCustomPK p_code = %v, want USER-SAVED-NEW-CODE", got)
	}
	if got := read["id"]; got != "editor-selected-id" {
		t.Fatalf("FindByCustomPK id = %v, want editor-selected-id", got)
	}
}

func TestDiagnosticBroadcastWuwebDuplicates(t *testing.T) {
	dataDir := os.Getenv("CSM_DATA_DIR")
	if dataDir == "" {
		dataDir = "/Volumes/Datas/CSM/JavaProjects/csm_server/backend/csm_datas"
	}
	if _, err := os.Stat(dataDir); err != nil {
		t.Skip("data dir not available")
	}
	os.Setenv("APP_DATA_DIR", dataDir)
	cfg := config.LoadFromEnv()
	rm, err := NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("NewRecordManager: %v", err)
	}
	defer rm.ShutdownAll()

	type hit struct {
		storageKey string
		id         string
		codeLen    int
		codeStart  string
	}
	var hits []hit

	app, table := "csm", "sys_autos"
	_ = rm.scanTable(app, table, func(storageKey string, raw []byte) error {
		var rec map[string]any
		if json.Unmarshal(raw, &rec) != nil {
			return nil
		}
		pName, _ := rec["p_name"].(string)
		if pName != "broadcast_wuweb" {
			return nil
		}
		code := fmt.Sprint(rec["p_code"])
		hits = append(hits, hit{
			storageKey: storageKey,
			id:         fmt.Sprint(rec["id"]),
			codeLen:    len(code),
			codeStart:  trimPreview(code, 120),
		})
		return nil
	})

	pkRead := rm.FindByCustomPK(app, table, map[string]any{
		"p_name": "broadcast_wuweb",
		"p_type": float64(0),
	}, []string{"p_name", "p_type"})

	t.Logf("FindByCustomPK: id=%v code_len=%d start=%q", pkRead["id"], len(fmt.Sprint(pkRead["p_code"])), trimPreview(fmt.Sprint(pkRead["p_code"]), 120))
	for _, h := range hits {
		t.Logf("per-table key=%s id=%s code_len=%d start=%q", h.storageKey, h.id, h.codeLen, h.codeStart)
	}
	if len(hits) > 1 {
		t.Logf("WARNING: %d duplicate Pebble keys for broadcast_wuweb", len(hits))
	}
}

func trimPreview(s string, n int) string {
	s = strings.ReplaceAll(s, "\n", "\\n")
	if len(s) <= n {
		return s
	}
	return s[:n]
}
