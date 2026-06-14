package handlers

import (
	"os"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

func testLookupRecordManager(t *testing.T) *data.RecordManager {
	t.Helper()
	dir := t.TempDir()
	os.Setenv("APP_DATA_DIR", dir)
	cfg := config.LoadFromEnv()
	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("NewRecordManager: %v", err)
	}
	t.Cleanup(rm.ShutdownAll)
	return rm
}

func TestLookupRecordsForUpdate_SysAutosUsesCustomPK(t *testing.T) {
	rm := testLookupRecordManager(t)
	_, err := rm.CreateRecord("csm", "sys_autos", map[string]any{
		"id":     "stored-id-1",
		"p_name": "save_me",
		"p_type": float64(1),
		"p_code": "big-encrypted-payload",
	}, []string{"p_name", "p_type"})
	if err != nil {
		t.Fatalf("CreateRecord: %v", err)
	}

	h := &TableHandler{rm: rm}
	filter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("p_name", "save_me"),
			model.EqFilter("p_type", float64(1)),
			model.EqFilter("id", "client-stale-id"),
		},
	}
	objUpdate := map[string]any{
		"id":     "client-stale-id",
		"p_name": "save_me",
		"p_type": float64(1),
		"p_code": "updated",
	}

	rows := h.lookupRecordsForUpdate("csm", "sys_autos", filter, objUpdate, []string{"p_name", "p_type"}, "update")
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}
	if rows[0]["p_name"] != "save_me" {
		t.Fatalf("p_name = %v", rows[0]["p_name"])
	}
}
