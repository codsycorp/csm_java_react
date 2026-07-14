package handlers

import (
	"bytes"
	"testing"
)

func TestRenderDynamicDesignSpecPDFToBytes(t *testing.T) {
	spec := map[string]any{
		"title": "BÁO CÁO THỬ NGHIỆM",
		"header": []any{
			map[string]any{"label": "Mã báo cáo", "token": "reportNo", "sampleValue": "BC-001"},
			map[string]any{"label": "Khách hàng", "token": "clientName", "sampleValue": "Công ty ABC"},
		},
		"sections": []any{
			map[string]any{"title": "Chi tiết", "lines": []any{"Số lượng: {qty}", "Đơn giá: {price}"}},
		},
		"totals": []any{
			map[string]any{"label": "Tổng cộng", "token": "tong_cong", "value": "{tong_cong}"},
		},
		"footer": []any{"Ghi chú: {ghi_chu}"},
	}
	data := map[string]any{
		"reportNo":   "BC-001",
		"clientName": "Công ty ABC",
		"qty":        "12",
		"price":      "100.000",
		"tong_cong":  "1.200.000",
		"ghi_chu":    "Dữ liệu thật",
	}

	pdfBytes, err := renderDynamicDesignSpecPDFToBytes(spec, data)
	if err != nil {
		t.Fatalf("renderDynamicDesignSpecPDFToBytes returned error: %v", err)
	}
	if len(pdfBytes) == 0 {
		t.Fatal("expected pdf bytes")
	}
	if !bytes.Contains(pdfBytes, []byte("%PDF")) {
		t.Fatalf("expected PDF header, got %q", string(pdfBytes[:min(16, len(pdfBytes))]))
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
