package handlers

import (
	"bytes"
	"testing"
)

func TestIsAllowedPdfSourcePath(t *testing.T) {
	tests := []struct {
		name string
		path string
		want bool
	}{
		{name: "app images pdf", path: "app_images/csm/sample.pdf", want: true},
		{name: "reports pdf", path: "reports/demo/sample.pdf", want: true},
		{name: "leading slash normalized by caller still okay after trim", path: "app_images/csm/demo.pdf", want: true},
		{name: "reject docx", path: "app_images/csm/sample.docx", want: false},
		{name: "reject traversal", path: "app_images/../secret/sample.pdf", want: false},
		{name: "reject outside prefix", path: "tmp/sample.pdf", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isAllowedPdfSourcePath(tt.path); got != tt.want {
				t.Fatalf("isAllowedPdfSourcePath(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

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

func TestRenderQuotationGroupedDesignSpecPDFToBytes(t *testing.T) {
	spec := map[string]any{
		"layoutKind": "quotation-grouped-table",
		"title":      "BẢNG BÁO GIÁ SẢN PHẨM - KIÊM XÁC NHẬN ĐƠN HÀNG",
		"company": map[string]any{
			"name":    "CÔNG TY TNHH CÔNG NGHỆ CÔNG NGHIỆP PHÚ SƠN",
			"address": "Lô 7 CN5, Cụm công nghiệp Ngọc Hồi, xã Ngọc Hồi, Thành phố Hà Nội",
			"taxCode": "0104113174",
			"website": "https://panelphuson.vn     https://javta.vn",
		},
		"table": map[string]any{
			"grouped": true,
			"headers": []any{"TT", "Tên sản phẩm/Quy cách", "Đơn vị", "Chiều rộng", "Chiều dài", "Số tấm", "Khối lượng", "Đơn giá (VNĐ)", "Thành tiền (VNĐ)"},
			"widths":  []any{9, 75, 11, 13, 13, 11, 18, 22, 18},
		},
	}
	data := map[string]any{
		"quotation_no": "090626.01",
		"date":         "09/06/26",
		"valid_until":  "14/06/2026",
		"amount_words": "Một trăm mười bảy triệu, không trăm ba mươi tám nghìn, một trăm bảy mươi đồng ./.",
		"client": map[string]any{
			"company": "Công ty CP Giải pháp Cách nhiệt Việt Nam",
			"address": "Lô 7 CN6 - Cụm công nghiệp Ngọc Hồi",
			"contact": "Mr Thành - 0982476556",
		},
		"sales": map[string]any{"name": "Mr Long - 0978349917"},
		"items": []any{
			map[string]any{"group_title": "PANEL PUR VÁCH TRONG (TÔN + PU + TÔN):", "group_desc": "* Mặt thứ nhất: Tôn nền Kamazn, dày 0,50±0,04mm", "vat_rate": 8, "name": "Tấm số 1", "unit": "m²", "width": 1.13, "length": 5.0, "quantity": 22, "unit_price": 452000},
			map[string]any{"group_title": "PANEL PUR VÁCH TRONG (TÔN + PU + TÔN):", "group_desc": "* Mặt thứ nhất: Tôn nền Kamazn, dày 0,50±0,04mm", "vat_rate": 8, "name": "Tấm số 2", "unit": "m²", "width": 1.13, "length": 5.5, "quantity": 12, "unit_price": 452000},
			map[string]any{"group_title": "PHỤ KIỆN VÁCH: Không gấp mép", "group_desc": "* Tôn nền Kamaz, dày 0,45±0,04mm, AZM50", "vat_rate": 10, "name": "Khổ 400mm", "unit": "m", "width": 0.4, "length": 4.0, "quantity": 15, "unit_price": 42000},
		},
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

func TestRenderOverlayTemplateSpecPDFToBytes(t *testing.T) {
	spec := map[string]any{
		"title": "Mẫu Overlay",
		"overlayItems": []any{
			map[string]any{"page": 1, "x": 15, "y": 20, "fontSize": 12, "bold": true, "text": "{title}"},
			map[string]any{"page": 1, "x": 15, "y": 28, "fontSize": 10, "text": "Khách hàng: {clientName}"},
		},
	}
	data := map[string]any{
		"title":      "BÁO CÁO ĐỘNG",
		"clientName": "Công ty XYZ",
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

func TestRenderQuotationGroupedSpecTakesPriorityOverOverlayItems(t *testing.T) {
	spec := map[string]any{
		"layoutKind": "quotation-grouped-table",
		"title":      "BẢNG BÁO GIÁ SẢN PHẨM - KIÊM XÁC NHẬN ĐƠN HÀNG",
		"company": map[string]any{
			"name":    "CÔNG TY TNHH CÔNG NGHỆ CÔNG NGHIỆP PHÚ SƠN",
			"address": "Lô 7 CN5, Cụm công nghiệp Ngọc Hồi, xã Ngọc Hồi, Thành phố Hà Nội",
			"taxCode": "0104113174",
			"website": "https://panelphuson.vn https://javta.vn",
		},
		"table": map[string]any{
			"grouped": true,
			"headers": []any{"TT", "Tên sản phẩm/Quy cách", "Đơn vị", "Chiều rộng", "Chiều dài", "Số tấm", "Khối lượng", "Đơn giá (VNĐ)", "Thành tiền (VNĐ)"},
			"widths":  []any{9, 75, 11, 13, 13, 11, 18, 22, 18},
		},
		"overlayItems": []any{
			map[string]any{"page": 1, "x": 15, "y": 20, "fontSize": 12, "text": "{title}"},
		},
	}
	data := map[string]any{
		"quotation_no": "090626.01",
		"date":         "09/06/26",
		"valid_until":  "14/06/2026",
		"client": map[string]any{
			"company": "Công ty CP Giải pháp Cách nhiệt Việt Nam",
			"address": "Lô 7 CN6 - Cụm công nghiệp Ngọc Hồi",
			"contact": "Mr Thành - 0982476556",
		},
		"sales": map[string]any{"name": "Mr Long - 0978349917"},
		"items": []any{
			map[string]any{"group_title": "PANEL PUR VÁCH TRONG (TÔN + PU + TÔN):", "group_desc": "* Mặt thứ nhất: Tôn nền Kamazn, dày 0,50±0,04mm", "vat_rate": 8, "name": "Tấm số 1", "unit": "m²", "width": 1.13, "length": 5.0, "quantity": 22, "unit_price": 452000},
		},
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
	if bytes.Contains(pdfBytes, []byte("{title}")) {
		t.Fatal("expected grouped quotation renderer to resolve data instead of emitting raw overlay placeholder")
	}
	if !bytes.Contains(pdfBytes, []byte("/Type /Page")) {
		t.Fatal("expected a valid paged PDF document")
	}
}

func TestInferQuotationSpecFromSampleText(t *testing.T) {
	sample := map[string]any{
		"orderedLines": []string{
			"CÔNG TY TNHH CÔNG NGHỆ CÔNG NGHIỆP PHÚ SƠN MST: 0104113174",
			"Địa chỉ: Lô 7 CN5, Cụm công nghiệp Ngọc Hồi, xã Ngọc Hồi, Thành phố Hà Nội",
			"Website: panelphuson.vn | javta.vn",
			"BẢNG BÁO GIÁ SẢN PHẨM - KIÊM XÁC NHẬN ĐƠN HÀNG",
			"Kính gửi: Công ty CP Giải pháp Cách nhiệt Việt Nam Số: 090626.01",
			"Địa chỉ: Lô 7 CN6 - Cụm công nghiệp Ngọc Hồi Ngày: 09/06/26",
			"Người liên hệ: Mr Thành - 0982476556 Hiệu lực đến: 14/06/2026",
			"NVKD: Mr Long - 0978349917",
			"Cảm ơn Quý khách hàng đã quan tâm tới sản phẩm do Công ty TNHH Công nghệ Công nghiệp Phú Sơn sản xuất.",
			"Chúng tôi xin gửi Báo giá sản phẩm theo yêu cầu Quý khách đã cung cấp với nội dung như sau:",
			"TT Tên sản phẩm / Quy cách Đơn vị C.Rộng C.Dài Số tấm K.Lượng Đơn giá (VNĐ) Thành tiền (VNĐ)",
			"Ghi chú:",
			"1. Đơn giá đã bao gồm VAT",
			"Thông tin tài khoản nhận đơn đặt hàng:",
			"Tên TK: Công ty TNHH Công Nghệ Công Nghiệp Phú Sơn. Số TK: 7999989399 mở tại MB Bank - CN Hai Bà Trưng",
			"ĐẠI DIỆN BÊN MUA ĐẠI DIỆN BÊN BÁN",
		},
	}

	fitted := inferQuotationSpecFromSampleText(map[string]any{}, sample)
	if kind := fitted["layoutKind"]; kind != "quotation-grouped-table" {
		t.Fatalf("expected quotation layout kind, got %#v", kind)
	}
	company := toMapAny(fitted["company"])
	if company["taxCode"] != "{company.tax_code}" {
		t.Fatalf("expected company.taxCode token, got %#v", company["taxCode"])
	}
	quotation := toMapAny(fitted["quotation"])
	if quotation["recipientToken"] != "client.company" {
		t.Fatalf("expected recipient token, got %#v", quotation["recipientToken"])
	}
	if bankTitle, _ := quotation["bankTitle"].(string); bankTitle == "" {
		t.Fatalf("expected bankTitle from sample, got %#v", quotation["bankTitle"])
	}
	if buyerLabel, _ := quotation["buyerLabel"].(string); buyerLabel == "" {
		t.Fatalf("expected buyerLabel from sample, got %#v", quotation["buyerLabel"])
	}
	table := toMapAny(fitted["table"])
	if grouped, _ := table["grouped"].(bool); !grouped {
		t.Fatalf("expected grouped table=true, got %#v", table["grouped"])
	}
	if intro, _ := fitted["intro"].(string); intro == "" || !bytes.Contains([]byte(intro), []byte("Chúng tôi xin gửi Báo giá")) {
		t.Fatalf("expected combined intro block, got %#v", fitted["intro"])
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
