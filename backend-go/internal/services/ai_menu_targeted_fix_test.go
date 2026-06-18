package services

import (
	"strings"
	"testing"
)

func TestIsMenuTableFieldI18nComboRequest(t *testing.T) {
	msg := "Tất cả các cột khi chọn tiếng việt hiện tiếng anh. Xem f_types=co tại sao không có giá trị"
	if !IsMenuTableFieldI18nComboRequest(msg) {
		t.Fatal("expected i18n/combo request")
	}
}

func TestAnalyzeMenuTableFieldIssuesMissingHeaderVi(t *testing.T) {
	menu := `{"menu":[{"id":"m1","table_name":"products","table":[
		{"id":"m1@@@@@name","f_name":"name","f_header":"Tên SP","f_header_en":"Product Name","f_types":"ed"},
		{"id":"m1@@@@@dvt","f_name":"dvt","f_header":"ĐVT","f_header_en":"Unit","f_types":"co","f_cbo_query":""}
	]}]}`
	issues := AnalyzeMenuTableFieldIssues(menu)
	if len(issues) < 2 {
		t.Fatalf("expected >=2 issues, got %d: %+v", len(issues), issues)
	}
}

func TestApplyDeterministicMenuTableFieldFixesHeaderVi(t *testing.T) {
	menu := `{"menu":[{"id":"m1","table":[{"f_name":"name","f_header":"Tên SP","f_header_en":"Product Name","f_types":"ed"}]}]}`
	merged, remaining, fixed := ApplyDeterministicMenuTableFieldFixes(menu)
	if fixed != 1 {
		t.Fatalf("fixed=%d want 1", fixed)
	}
	if !strings.Contains(merged, `"f_header_vi": "Tên SP"`) {
		t.Fatalf("expected f_header_vi set: %s", merged)
	}
	_ = remaining
}

func TestPlanEditTaskBroadAuditLargeMenuEnabledWithoutScan(t *testing.T) {
	padding := strings.Repeat(" ", menuLargeFastPathChars)
	menu := `{"menu":[{"id":"m1","table":[{"f_name":"dvt","f_header_en":"Unit","f_types":"co"}]}],"_pad":"` + padding + `"}`
	req := &CodeStreamRequest{
		ContextType:    "menu_json",
		Message:        "Tất cả các cột của bảng khi chọn chế độ tiếng việt nó lại hiện tiếng anh. Xem kỹ kiểu co tại sao không có giá trị",
		FullCurrentCode: menu,
	}
	plan := PlanEditTask(req, "edit")
	if !plan.Enabled {
		t.Fatal("expected enabled for broad audit large menu")
	}
	if len(plan.Slices) != 0 {
		t.Fatalf("expected no LLM slices for deterministic audit, got %d", len(plan.Slices))
	}
}

func TestPlanEditTaskUsesFieldSlicesForI18nRequest(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Cột combo co hiện tiếng Anh khi chọn tiếng Việt, f_cbo_query trống",
		CurrentCode: `{"menu":[{"id":"m1","table_name":"t","table":[
			{"id":"m1@@@@@dvt","f_name":"dvt","f_header":"ĐVT","f_header_en":"Unit","f_types":"co","f_cbo_query":""}
		]}]}`,
	}
	plan := PlanEditTask(req, "edit")
	if !plan.Enabled {
		t.Fatal("plan disabled")
	}
	if len(plan.Slices) == 0 {
		t.Fatal("expected field slices")
	}
	if plan.Slices[0].FieldIssue == nil {
		t.Fatalf("expected targeted field slice, got %+v", plan.Slices[0])
	}
	if plan.Slices[0].FieldIssue.FName != "dvt" {
		t.Fatalf("unexpected field %s", plan.Slices[0].FieldIssue.FName)
	}
}
