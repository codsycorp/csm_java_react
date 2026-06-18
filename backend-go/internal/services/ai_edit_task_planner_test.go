package services

import (
	"strings"
	"testing"
)

func TestPlanEditTaskMenuSlices(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     `Sửa cột "dvt" f_types=co f_cbo_query khi chọn tiếng Việt`,
		CurrentCode: `{"menu":[{"id":"m1","label":"Sales","table":[{"id":"m1@@@@@dvt","f_name":"dvt","f_types":"co","f_cbo_query":""}]}]}`,
	}
	plan := PlanEditTask(req, "edit")
	if !plan.Enabled {
		t.Fatal("plan disabled")
	}
	if len(plan.Slices) == 0 {
		t.Fatal("no slices")
	}
	if len(plan.TargetSymbols) == 0 {
		t.Fatal("expected target symbols")
	}
	found := false
	for _, s := range plan.Slices {
		if strings.Contains(s.Objective, "dvt") || strings.Contains(strings.Join(s.Symbols, ","), "f_types") {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected dvt/f_types slice, got %+v", plan.Slices)
	}
}

func TestExtractMenuNodesMatchingSymbols(t *testing.T) {
	code := `{"menu":[{"id":"m1","table":[{"f_name":"dvt","f_types":"co"}]}]}`
	got := extractMenuNodesMatchingSymbols(code, []string{"f_types"})
	if got == "" || !strings.Contains(got, "dvt") {
		t.Fatalf("unexpected node context: %q", got)
	}
}
