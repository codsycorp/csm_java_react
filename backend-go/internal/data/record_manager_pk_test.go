package data

import (
	"os"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
)

func testRecordManager(t *testing.T) *RecordManager {
	t.Helper()
	dir := t.TempDir()
	os.Setenv("APP_DATA_DIR", dir)
	cfg := config.LoadFromEnv()
	rm, err := NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("NewRecordManager: %v", err)
	}
	t.Cleanup(rm.ShutdownAll)
	return rm
}

func TestTryFindByPKVariants_IgnoresStaleIDInANDFilter(t *testing.T) {
	rm := testRecordManager(t)
	_, err := rm.CreateRecord("csm", "index", map[string]any{
		"id": "sys_autos",
		"struct": map[string]any{
			"fieldsPK": []any{"p_name", "p_type"},
		},
	}, []string{"id"})
	if err != nil {
		t.Fatalf("CreateRecord index: %v", err)
	}
	_, err = rm.CreateRecord("csm", "sys_autos", map[string]any{
		"id":     "stored-id-1",
		"p_name": "demo_code",
		"p_type": float64(0),
		"p_code": "encrypted-body",
	}, []string{"p_name", "p_type"})
	if err != nil {
		t.Fatalf("CreateRecord: %v", err)
	}

	filter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("p_name", "demo_code"),
			model.EqFilter("p_type", float64(0)),
			model.EqFilter("id", "client-stale-id"),
		},
	}

	rec := rm.tryFindByPKVariants("csm", "sys_autos", filter)
	if len(rec) == 0 {
		t.Fatal("expected PK lookup without full scan when id in e_where is stale")
	}
	if got := rec["id"]; got != "stored-id-1" {
		t.Fatalf("id = %v, want stored-id-1", got)
	}
}
