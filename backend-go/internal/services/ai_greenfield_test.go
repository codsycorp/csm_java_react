package services

import "testing"

func TestIsComprehensiveGreenfieldMenuRequest(t *testing.T) {
	if !IsComprehensiveGreenfieldMenuRequest("Tạo menu ERP đầy đủ bán hàng xuất nhập công nợ báo cáo") {
		t.Fatal("expected comprehensive")
	}
	if IsComprehensiveGreenfieldMenuRequest("sửa label node kho") {
		t.Fatal("expected not comprehensive")
	}
}

func TestBuildGreenfieldMenuScaffoldJson(t *testing.T) {
	spec := BusinessSpec{
		Greenfield: true,
		Modules:    []string{"Bán hàng", "Kho"},
		DomainSummary: "ERP bán hàng",
	}
	msg := "Tạo menu ERP đầy đủ xuất nhập tồn kho bán hàng công nợ báo cáo"
	got := BuildGreenfieldMenuScaffoldJson(spec, msg)
	if got == "" {
		t.Fatal("empty scaffold")
	}
	nodes := CountMenuNodesFromDraft(got)
	if nodes < greenfieldScaffoldMinNodes {
		t.Fatalf("nodes=%d want >= %d", nodes, greenfieldScaffoldMinNodes)
	}
	if !containsStr(got, "biz_root") {
		t.Fatalf("missing root: %s", got[:200])
	}
}

func TestValidateMenuJSONPassesScaffold(t *testing.T) {
	spec := BusinessSpec{Greenfield: true, Modules: []string{"Kho", "Bán hàng"}}
	msg := "Tạo menu đầy đủ xuất nhập tồn kho bán hàng báo cáo công nợ"
	scaffold := BuildGreenfieldMenuScaffoldJson(spec, msg)
	roots := parseMenuRoots(scaffold)
	RepairMenuTreeInPlace(roots)
	report := ValidateMenuJSON(roots, msg)
	if !report.Passed {
		t.Fatalf("gate failed: %+v", report.Issues)
	}
}

func TestMaybeApplyGreenfieldMenuScaffold(t *testing.T) {
	spec := BusinessSpec{Greenfield: true}
	thin := `{"menu":[{"id":"a","label":"A","type_form":1,"table_name":"m_a","table":[{"f_name":"id","f_header":"ID","f_types":"ed","f_pkid":1}],"trigger":{"load_db":"x"}}]}`
	msg := "Tạo menu đầy đủ xuất nhập tồn kho bán hàng công nợ báo cáo"
	got := MaybeApplyGreenfieldMenuScaffold(thin, msg, spec)
	if CountMenuNodesFromDraft(got) <= CountMenuNodesFromDraft(thin) {
		t.Fatalf("expected scaffold to grow menu, got nodes=%d", CountMenuNodesFromDraft(got))
	}
}

func TestShouldRunGreenfieldScaffoldFirst(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json", Message: "Tạo menu đầy đủ ERP",
		CurrentCode: `{"menu":[]}`, ResponseMode: "edit",
	}
	spec := BusinessSpec{Greenfield: true, Modules: []string{"a", "b", "c"}}
	if !ShouldRunGreenfieldScaffoldFirst(req, spec, "edit") {
		t.Fatal("expected scaffold-first")
	}
}

func TestSlugTableName(t *testing.T) {
	if got := slugTableName("Bán hàng"); got != "m_ban_hang" {
		t.Fatalf("got %q", got)
	}
}
