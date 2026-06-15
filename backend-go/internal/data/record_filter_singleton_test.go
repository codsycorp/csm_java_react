package data

import (
	"encoding/json"
	"testing"

	"csm_server/backend-go/internal/model"
)

func TestFilterSysAutosByPTypeReturnsAllRows(t *testing.T) {
	rm := testRecordManager(t)
	app, table := "csm", "sys_autos"

	seed := []map[string]any{
		{"id": "a1", "p_name": "broadcast_app1", "p_type": float64(0), "p_code": "CODE-A"},
		{"id": "a2", "p_name": "broadcast_app2", "p_type": float64(0), "p_code": "CODE-B"},
		{"id": "a3", "p_name": "template_html", "p_type": float64(1), "p_code": "HTML-C"},
	}
	db, err := rm.tableDB(app, table)
	if err != nil {
		t.Fatalf("tableDB: %v", err)
	}
	for _, rec := range seed {
		raw, _ := json.Marshal(rec)
		key := rec["id"].(string)
		if err := db.Set([]byte(key), raw, nil); err != nil {
			t.Fatalf("seed %s: %v", key, err)
		}
	}

	filter := model.EqFilter("p_type", 0)
	if rm.isSingletonLookupFilter(app, table, filter) {
		t.Fatal("p_type-only filter must be list query, not singleton PK lookup")
	}

	result := rm.Filter(app, table, filter)
	rows, _ := result["rows"].([]any)
	if len(rows) < 2 {
		t.Fatalf("Filter p_type=0 rows = %d, want >= 2 (got partial PK singleton bug)", len(rows))
	}
}
