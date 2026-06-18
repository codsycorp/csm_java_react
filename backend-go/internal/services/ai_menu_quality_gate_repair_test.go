package services

import (
	"strings"
	"testing"
)

func TestMergeMenuTableFieldsByNamePreservesOtherColumns(t *testing.T) {
	base := `{"menu":[{"id":"m1","table":[
		{"f_name":"name","f_header":"Tên","f_types":"ed"},
		{"f_name":"dvt","f_header":"Unit","f_header_en":"Unit","f_types":"co"}
	]}]}`
	patch := `{"status":"success","patches":[{"action":"edit","nodeId":"m1","after":{"table":[
		{"f_name":"dvt","f_header":"ĐVT","f_header_vi":"ĐVT","f_header_en":"Unit"}
	]}}]}`
	preview := BuildMenuCompletionMergePreview(base, patch)
	if preview.MergedResponse == "" {
		t.Fatal("expected merged response")
	}
	if !strings.Contains(preview.MergedResponse, `"f_name": "name"`) {
		t.Fatalf("lost name column: %s", preview.MergedResponse)
	}
	if !strings.Contains(preview.MergedResponse, `"f_header_vi": "ĐVT"`) {
		t.Fatalf("expected dvt f_header_vi: %s", preview.MergedResponse)
	}
}

func TestBuildRepairPatchEnvelopeFillsHeaderVi(t *testing.T) {
	menu := `{"menu":[{"id":"m1","table_name":"products","table":[
		{"f_name":"dvt","f_header_en":"Unit","f_types":"co"},
		{"f_name":"name","f_header":"Tên SP","f_header_en":"Product Name","f_types":"ed"}
	]}]}`
	envelope := BuildRepairPatchEnvelope(menu, 32)
	if envelope == "" {
		t.Fatal("expected repair envelope")
	}
	preview := BuildMenuCompletionMergePreview(menu, envelope)
	if preview.MergedResponse == "" {
		t.Fatalf("merge failed: %s", envelope)
	}
	if !strings.Contains(preview.MergedResponse, `"f_header_vi": "ĐVT"`) {
		t.Fatalf("expected ĐVT vi header: %s", preview.MergedResponse)
	}
	if !strings.Contains(preview.MergedResponse, `"f_header_vi": "Tên SP"`) {
		t.Fatalf("expected Tên SP vi header: %s", preview.MergedResponse)
	}
}

func TestIsBroadMenuAuditRequestUserMessage(t *testing.T) {
	msg := "Tất cả các cột của bảng khi chọn chế độ tiếng việt nó lại hiện tiếng anh. Xem kỹ kiểu co tại sao không có giá trị"
	if !IsBroadMenuAuditRequest(msg) {
		t.Fatal("expected broad audit request")
	}
}

func TestApplyMenuQualityGateInPlaceLargeMenuFastPath(t *testing.T) {
	// Simulate large menu payload without O(n²) extraction.
	var cols []string
	for i := 0; i < 200; i++ {
		cols = append(cols, `{"f_name":"f`+itoa(i)+`","f_header_en":"Col `+itoa(i)+`","f_types":"ed"}`)
	}
	padding := strings.Repeat(" ", menuLargeFastPathChars)
	menu := `{"menu":[{"id":"m1","label":"Menu","table":[` + strings.Join(cols, ",") + `]}],"_pad":"` + padding + `"}`
	merged, fixed, changed := ApplyMenuQualityGateInPlace(menu)
	if !changed || fixed == 0 || merged == "" {
		t.Fatalf("expected in-place repairs fixed=%d changed=%v len=%d", fixed, changed, len(merged))
	}
	if !strings.Contains(merged, `"f_header_vi"`) {
		t.Fatal("expected f_header_vi in merged large menu")
	}
}
