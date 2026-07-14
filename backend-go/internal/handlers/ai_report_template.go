package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jung-kurt/gofpdf"
	"github.com/pdfcpu/pdfcpu/pkg/api"
)

var reportTemplateTokenPattern = regexp.MustCompile(`\{([a-zA-Z0-9_.-]+)\}`)

type reportTemplateSpec struct {
	Name    string           `json:"name"`
	Title   string           `json:"title"`
	Header  map[string]any   `json:"header"`
	Notes   []string         `json:"notes"`
	Columns []map[string]any `json:"columns"`
}

func defaultReportTemplateSpec(templatePath string) *reportTemplateSpec {
	name := "default-report"
	if strings.TrimSpace(templatePath) != "" {
		name = strings.TrimSpace(templatePath)
	}
	return &reportTemplateSpec{
		Name:  name,
		Title: "BÁO CÁO",
		Header: map[string]any{
			"reportNo":   "{reportNo}",
			"clientName": "{clientName}",
			"reportDate": "{reportDate}",
		},
		Notes: []string{"{notes}"},
		Columns: []map[string]any{
			{"title": "Mục", "field": "name", "width": 30},
			{"title": "Giá trị", "field": "value", "width": 70},
		},
	}
}

func (h *AiHandler) handleAiLocalRenderTemplate(params map[string]any) map[string]any {
	return h.handleAiLocalRenderTemplateInternal(params, false)
}

func (h *AiHandler) handleAiLocalRenderTemplatePreview(params map[string]any) map[string]any {
	return h.handleAiLocalRenderTemplateInternal(params, true)
}

func (h *AiHandler) handleAiLocalRenderTemplateInternal(params map[string]any, previewMode bool) map[string]any {
	appID := sanitizeAppID(paramStr(params, "appId"))
	if appID == "" {
		appID = "csm"
	}

	dynamicSpec, dynamicSpecOk, dynamicSpecErr := h.parseDynamicDesignSpec(params)
	if dynamicSpecErr != nil {
		return map[string]any{"success": false, "errorCode": "DESIGN_SPEC_INVALID", "message": dynamicSpecErr.Error()}
	}

	templatePath := strings.TrimSpace(paramStr(params, "templatePath"))
	if templatePath == "" && !dynamicSpecOk {
		return map[string]any{"success": false, "errorCode": "TEMPLATE_PATH_REQUIRED", "message": "missing templatePath"}
	}

	var spec *reportTemplateSpec
	var specData map[string]any
	if dynamicSpecOk {
		specData = dynamicSpec
	} else {
		var specErr error
		spec, specErr = h.loadReportTemplateSpec(templatePath)
		if specErr != nil {
			inlineSpec, inlineOk, inlineErr := h.parseInlineTemplateSpec(params)
			if inlineOk && inlineErr == nil {
				spec = inlineSpec
			} else {
				spec = defaultReportTemplateSpec(templatePath)
			}
		}
		if spec != nil {
			specData = map[string]any{
				"title":   spec.Title,
				"header":  spec.Header,
				"notes":   spec.Notes,
				"columns": spec.Columns,
			}
		}
	}

	if sampleInputErr := h.validateSamplePdfInputIfProvided(params); sampleInputErr != nil {
		return map[string]any{"success": false, "errorCode": "SAMPLE_PDF_REQUIRED", "message": sampleInputErr.Error()}
	}

	dataMap := buildRenderData(params)
	outputName := sanitizePdfOutputName(paramStr(params, "outputName"))
	if outputName == "" {
		outputName = fmt.Sprintf("template_report_%d.pdf", time.Now().UnixMilli())
	}

	saveToDisk := paramBool(params, "saveToDisk", !previewMode)
	if previewMode {
		saveToDisk = false
	}
	var pdfBytes []byte
	var relPath string
	if previewMode {
		relPath = fmt.Sprintf("app_images/%s/%s", appID, outputName)
		var renderErr error
		if dynamicSpecOk {
			pdfBytes, renderErr = renderDynamicDesignSpecPDFToBytes(specData, dataMap)
		} else {
			pdfBytes, renderErr = renderReportTemplatePDFToBytes(spec, dataMap)
		}
		if renderErr != nil {
			return map[string]any{"success": false, "errorCode": "PDF_RENDER_FAILED", "message": renderErr.Error()}
		}
	} else if saveToDisk {
		publicDir := filepath.Join(h.cfg.DataDir, "public", "app_images", appID)
		if err := os.MkdirAll(publicDir, 0o755); err != nil {
			return map[string]any{"success": false, "errorCode": "PDF_PUBLIC_DIR_FAILED", "message": err.Error()}
		}

		outputAbs := filepath.Join(publicDir, outputName)
		if dynamicSpecOk {
			if err := renderDynamicDesignSpecPDF(outputAbs, specData, dataMap); err != nil {
				return map[string]any{"success": false, "errorCode": "PDF_RENDER_FAILED", "message": err.Error()}
			}
		} else if err := renderReportTemplatePDF(outputAbs, spec, dataMap); err != nil {
			return map[string]any{"success": false, "errorCode": "PDF_RENDER_FAILED", "message": err.Error()}
		}
		relPath = fmt.Sprintf("app_images/%s/%s", appID, outputName)
		if fileBytes, readErr := os.ReadFile(outputAbs); readErr == nil {
			pdfBytes = fileBytes
		}
	} else {
		var renderErr error
		if dynamicSpecOk {
			pdfBytes, renderErr = renderDynamicDesignSpecPDFToBytes(specData, dataMap)
		} else {
			pdfBytes, renderErr = renderReportTemplatePDFToBytes(spec, dataMap)
		}
		if renderErr != nil {
			return map[string]any{"success": false, "errorCode": "PDF_RENDER_FAILED", "message": renderErr.Error()}
		}
	}

	result := map[string]any{
		"success":       true,
		"message":       map[bool]string{true: "template_report_preview_ready", false: "template_report_rendered"}[previewMode],
		"templateName":  templatePath,
		"templatePath":  templatePath,
		"pdfPath":       relPath,
		"pdfUrl":        "/" + relPath,
		"outputName":    outputName,
		"customerCode":  strings.TrimSpace(paramStr(params, "customerCode")),
		"renderedAtUtc": time.Now().UTC().Format(time.RFC3339),
		"previewMode":   previewMode,
	}
	if sampleAnalysis := h.analyzeSamplePdf(params); sampleAnalysis != nil {
		result["samplePdfAnalysis"] = sampleAnalysis
	}
	if previewMode {
		if dynamicSpecOk {
			result["designPlan"] = h.buildDynamicDesignPlan(specData, dataMap, params)
		} else {
			result["designPlan"] = h.buildDesignPlan(spec, dataMap, params)
		}
	}
	if dynamicSpecOk {
		result["designSpec"] = specData
	}
	if len(pdfBytes) > 0 {
		result["pdfSize"] = len(pdfBytes)
	}
	if previewMode || paramBool(params, "returnBase64", false) {
		result["pdfBase64"] = base64.StdEncoding.EncodeToString(pdfBytes)
		result["pdfMimeType"] = "application/pdf"
	}
	return result
}

func (h *AiHandler) validateSamplePdfInputIfProvided(params map[string]any) error {
	for _, key := range []string{"samplePdfPath", "pdfPath", "samplePdfDataUrl", "pdfDataUrl", "samplePdfBase64", "pdfBase64"} {
		value := strings.TrimSpace(paramStr(params, key))
		if value != "" {
			_, _, err := h.resolveSamplePdfInput(params)
			return err
		}
	}
	return nil
}

func (h *AiHandler) buildDesignPlan(spec *reportTemplateSpec, data map[string]any, params map[string]any) map[string]any {
	plan := map[string]any{
		"templateName":            spec.Name,
		"recommendedTitle":        renderTemplateText(spec.Title, data),
		"recommendedHeaderFields": []string{"reportNo", "reportDate", "clientName"},
		"recommendedNotes":        spec.Notes,
		"recommendedColumns":      spec.Columns,
		"previewHint":             "Dùng mẫu PDF đã nạp để kiểm tra bố cục, tiêu đề và các trường dữ liệu trước khi xuất chính thức",
	}
	if sampleAnalysis := h.analyzeSamplePdf(params); sampleAnalysis != nil {
		plan["samplePdfAnalysis"] = sampleAnalysis
		if orderedLines, ok := sampleAnalysis["orderedLines"].([]string); ok && len(orderedLines) > 0 {
			plan["sampleTextPreview"] = orderedLines[:minInt(8, len(orderedLines))]
		}
	}
	return plan
}

func (h *AiHandler) buildDynamicDesignPlan(spec map[string]any, data map[string]any, params map[string]any) map[string]any {
	plan := map[string]any{
		"templateName":            fmt.Sprint(spec["title"]),
		"recommendedTitle":        renderTemplateText(fmt.Sprint(spec["title"]), data),
		"recommendedHeaderFields": []string{"reportNo", "reportDate", "clientName"},
		"recommendedNotes":        []string{},
		"recommendedColumns":      []any{},
		"previewHint":             "Dùng design spec đã sinh từ PDF mẫu để render preview và PDF cuối cùng",
	}
	if sampleAnalysis := h.analyzeSamplePdf(params); sampleAnalysis != nil {
		plan["samplePdfAnalysis"] = sampleAnalysis
		if orderedLines, ok := sampleAnalysis["orderedLines"].([]string); ok && len(orderedLines) > 0 {
			plan["sampleTextPreview"] = orderedLines[:minInt(8, len(orderedLines))]
		}
	}
	return plan
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (h *AiHandler) parseDynamicDesignSpec(params map[string]any) (map[string]any, bool, error) {
	for _, key := range []string{"reportDesignSpec", "report_design_spec", "designSpec", "design_spec", "templateSpec", "templatePayload", "template"} {
		var raw any
		if params != nil {
			raw = params[key]
		}
		if raw == nil {
			continue
		}
		switch v := raw.(type) {
		case string:
			trimmed := strings.TrimSpace(v)
			if trimmed == "" {
				continue
			}
			var spec map[string]any
			if err := json.Unmarshal([]byte(trimmed), &spec); err != nil {
				return nil, true, fmt.Errorf("invalid dynamic design spec json: %w", err)
			}
			return spec, true, nil
		case []byte:
			var spec map[string]any
			if err := json.Unmarshal(v, &spec); err != nil {
				return nil, true, fmt.Errorf("invalid dynamic design spec bytes: %w", err)
			}
			return spec, true, nil
		case map[string]any:
			return v, true, nil
		}
	}
	return nil, false, nil
}

func (h *AiHandler) parseInlineTemplateSpec(params map[string]any) (*reportTemplateSpec, bool, error) {
	for _, key := range []string{"template", "templateSpec", "templateJson", "templatePayload"} {
		var raw any
		if params != nil {
			raw = params[key]
		}
		if raw == nil {
			continue
		}
		switch v := raw.(type) {
		case string:
			if strings.TrimSpace(v) == "" {
				continue
			}
			var spec reportTemplateSpec
			if err := json.Unmarshal([]byte(v), &spec); err != nil {
				return nil, true, fmt.Errorf("invalid inline template json: %w", err)
			}
			return &spec, true, nil
		case []byte:
			var spec reportTemplateSpec
			if err := json.Unmarshal(v, &spec); err != nil {
				return nil, true, fmt.Errorf("invalid inline template bytes: %w", err)
			}
			return &spec, true, nil
		case map[string]any:
			data, err := json.Marshal(v)
			if err != nil {
				return nil, true, fmt.Errorf("invalid inline template map: %w", err)
			}
			var spec reportTemplateSpec
			if err := json.Unmarshal(data, &spec); err != nil {
				return nil, true, fmt.Errorf("invalid inline template map payload: %w", err)
			}
			return &spec, true, nil
		}
	}
	return nil, false, nil
}

func buildRenderData(params map[string]any) map[string]any {
	merged := map[string]any{}
	for _, key := range []string{"data", "menuData", "menuContext", "record", "sourceData", "payload"} {
		mergeRenderDataMap(merged, toMapAny(params[key]))
	}
	return merged
}

func mergeRenderDataMap(dst map[string]any, src map[string]any) {
	for k, v := range src {
		dst[k] = v
	}
}

func (h *AiHandler) loadReportTemplateSpec(templatePath string) (*reportTemplateSpec, error) {
	candidate := strings.TrimSpace(templatePath)
	candidate = strings.TrimPrefix(candidate, "/")
	candidate = strings.ReplaceAll(candidate, "\\", "/")

	var abs string
	if strings.HasPrefix(candidate, "app_images/") || strings.HasPrefix(candidate, "reports/") || strings.HasPrefix(candidate, "public/") {
		abs = filepath.Join(h.cfg.DataDir, "public", filepath.FromSlash(candidate))
	} else {
		abs = filepath.Join(h.cfg.DataDir, "public", "reports", candidate)
	}

	if _, err := os.Stat(abs); err != nil {
		if h.rm != nil {
			if p := h.rm.GetStaticFile(candidate); p != "" {
				abs = p
			}
		}
	}

	data, err := os.ReadFile(abs)
	if err != nil {
		return nil, fmt.Errorf("template file not found: %s", templatePath)
	}

	var spec reportTemplateSpec
	if err := json.Unmarshal(data, &spec); err != nil {
		return nil, fmt.Errorf("invalid template json: %w", err)
	}
	if strings.TrimSpace(spec.Title) == "" {
		spec.Title = "BÁO CÁO"
	}
	if spec.Header == nil {
		spec.Header = map[string]any{}
	}
	return &spec, nil
}

func renderReportTemplatePDF(outputPath string, spec *reportTemplateSpec, data map[string]any) error {
	pdfBytes, err := renderReportTemplatePDFToBytes(spec, data)
	if err != nil {
		return err
	}
	return os.WriteFile(outputPath, pdfBytes, 0o644)
}

func renderDynamicDesignSpecPDF(outputPath string, spec map[string]any, data map[string]any) error {
	pdfBytes, err := renderDynamicDesignSpecPDFToBytes(spec, data)
	if err != nil {
		return err
	}
	return os.WriteFile(outputPath, pdfBytes, 0o644)
}

func renderDynamicDesignSpecPDFToBytes(spec map[string]any, data map[string]any) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(12, 12, 12)
	pdf.SetAutoPageBreak(true, 12)
	pdf.AddPage()
	fontName := "Helvetica"
	_ = registerTemplateFont(pdf)

	title := renderTemplateText(fmt.Sprint(spec["title"]), data)
	if title == "" {
		title = "BÁO CÁO"
	}
	pdf.SetFont(fontName, "B", 13)
	pdf.CellFormat(0, 7, title, "", 1, "C", false, 0, "")
	pdf.Ln(2)

	pdf.SetFont(fontName, "", 9)
	if headerItems, ok := spec["header"].([]any); ok {
		for _, itemAny := range headerItems {
			itemMap := toMapAny(itemAny)
			label := fmt.Sprint(itemMap["label"])
			if label == "" {
				label = fmt.Sprint(itemMap["token"])
			}
			value := ""
			if rawValue, ok := itemMap["sampleValue"]; ok && rawValue != nil {
				value = renderTemplateText(fmt.Sprint(rawValue), data)
			} else if token, ok := itemMap["token"].(string); ok {
				value = renderTemplateText(fmt.Sprintf("{%s}", token), data)
			}
			if label != "" || value != "" {
				pdf.CellFormat(0, 5, fmt.Sprintf("%s: %s", label, value), "", 1, "L", false, 0, "")
			}
		}
	}

	pdf.Ln(2)
	if sections, ok := spec["sections"].([]any); ok && len(sections) > 0 {
		for _, sectionAny := range sections {
			sectionMap := toMapAny(sectionAny)
			sectionTitle := renderTemplateText(fmt.Sprint(sectionMap["title"]), data)
			if sectionTitle != "" {
				pdf.SetFont(fontName, "B", 10)
				pdf.CellFormat(0, 5, sectionTitle, "", 1, "L", false, 0, "")
				pdf.SetFont(fontName, "", 9)
			}
			if lines, ok := sectionMap["lines"].([]any); ok {
				for _, lineAny := range lines {
					lineText := renderTemplateText(fmt.Sprint(lineAny), data)
					if strings.TrimSpace(lineText) != "" {
						pdf.MultiCell(0, 4.5, lineText, "", "L", false)
					}
				}
			}
			pdf.Ln(1)
		}
	}

	if totals, ok := spec["totals"].([]any); ok && len(totals) > 0 {
		pdf.Ln(1)
		pdf.SetFont(fontName, "B", 9)
		pdf.CellFormat(0, 5, "Tổng cộng", "", 1, "L", false, 0, "")
		pdf.SetFont(fontName, "", 9)
		for _, totalAny := range totals {
			totalMap := toMapAny(totalAny)
			label := fmt.Sprint(totalMap["label"])
			value := renderTemplateText(fmt.Sprint(totalMap["value"]), data)
			if token, ok := totalMap["token"].(string); ok && token != "" && value == "" {
				value = renderTemplateText(fmt.Sprintf("{%s}", token), data)
			}
			if label != "" || value != "" {
				pdf.CellFormat(0, 5, fmt.Sprintf("%s: %s", label, value), "", 1, "L", false, 0, "")
			}
		}
	}

	if signatures, ok := spec["signatures"].([]any); ok && len(signatures) > 0 {
		pdf.Ln(1)
		pdf.SetFont(fontName, "B", 9)
		pdf.CellFormat(0, 5, "Ký xác nhận", "", 1, "L", false, 0, "")
		pdf.SetFont(fontName, "", 9)
		for _, sigAny := range signatures {
			sigMap := toMapAny(sigAny)
			label := fmt.Sprint(sigMap["label"])
			value := renderTemplateText(fmt.Sprint(sigMap["value"]), data)
			if token, ok := sigMap["token"].(string); ok && token != "" && value == "" {
				value = renderTemplateText(fmt.Sprintf("{%s}", token), data)
			}
			if label != "" || value != "" {
				pdf.CellFormat(0, 5, fmt.Sprintf("%s: %s", label, value), "", 1, "L", false, 0, "")
			}
		}
	}

	if footerItems, ok := spec["footer"].([]any); ok && len(footerItems) > 0 {
		pdf.Ln(1)
		pdf.SetFont(fontName, "", 8.5)
		for _, footerAny := range footerItems {
			footerText := renderTemplateText(fmt.Sprint(footerAny), data)
			if strings.TrimSpace(footerText) != "" {
				pdf.MultiCell(0, 4, footerText, "", "L", false)
			}
		}
	}

	buf := new(bytes.Buffer)
	if err := pdf.Output(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func renderReportTemplatePDFToBytes(spec *reportTemplateSpec, data map[string]any) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(12, 12, 12)
	pdf.SetAutoPageBreak(true, 12)
	pdf.AddPage()
	fontName := "Helvetica"
	_ = registerTemplateFont(pdf)
	pdf.SetFont(fontName, "B", 13)
	pdf.CellFormat(0, 7, renderTemplateText(spec.Title, data), "", 1, "C", false, 0, "")
	pdf.Ln(2)

	pdf.SetFont(fontName, "", 9)
	if len(spec.Header) > 0 {
		for key, raw := range spec.Header {
			label := strings.ReplaceAll(key, "_", " ")
			value := renderTemplateText(fmt.Sprint(raw), data)
			pdf.CellFormat(0, 5, fmt.Sprintf("%s: %s", label, value), "", 1, "L", false, 0, "")
		}
	}

	pdf.Ln(2)
	pdf.SetFont(fontName, "B", 10)
	pdf.CellFormat(0, 5, "Thông tin báo cáo", "", 1, "L", false, 0, "")
	pdf.SetFont(fontName, "", 9)
	metaFields := []string{"reportNo", "reportDate", "clientName"}
	for _, field := range metaFields {
		if v := resolvePath(data, field); v != nil {
			pdf.CellFormat(0, 4.5, fmt.Sprintf("%s: %s", field, renderTemplateText(fmt.Sprint(v), data)), "", 1, "L", false, 0, "")
		}
	}

	if len(spec.Notes) > 0 {
		pdf.Ln(1)
		pdf.SetFont(fontName, "B", 9)
		pdf.CellFormat(0, 5, "Ghi chú", "", 1, "L", false, 0, "")
		pdf.SetFont(fontName, "", 8.5)
		for _, note := range spec.Notes {
			pdf.MultiCell(0, 4.5, renderTemplateText(note, data), "", "L", false)
		}
	}

	if len(spec.Columns) > 0 {
		pdf.Ln(2)
		pdf.SetFont(fontName, "B", 8.5)
		pageWidth := 190.0
		headers := make([]string, 0, len(spec.Columns))
		widths := make([]float64, 0, len(spec.Columns))
		for _, col := range spec.Columns {
			title := renderTemplateText(fmt.Sprint(col["title"]), data)
			headers = append(headers, title)
			w := 20.0
			if raw, ok := col["width"]; ok {
				if n, err := fmt.Sscanf(fmt.Sprint(raw), "%f", &w); err == nil && n > 0 {
					w = float64(int(w))
				}
			}
			widths = append(widths, w)
		}
		if sum := totalWidth(widths); sum > 0 && sum > pageWidth {
			for i := range widths {
				widths[i] = widths[i] * pageWidth / sum
			}
		}
		for i, title := range headers {
			w := widths[i]
			if w <= 0 {
				w = pageWidth / float64(len(headers))
			}
			pdf.CellFormat(w, 6, title, "1", 0, "C", false, 0, "")
		}
		pdf.Ln(-1)

		itemsAny := []any{}
		if rawItems := resolvePath(data, "items"); rawItems != nil {
			if list, ok := rawItems.([]any); ok {
				itemsAny = list
			} else if list, ok := rawItems.([]map[string]any); ok {
				for _, item := range list {
					itemsAny = append(itemsAny, item)
				}
			}
		}
		pdf.SetFont(fontName, "", 8)
		for idx, rowAny := range itemsAny {
			row := toMapAny(rowAny)
			for i, col := range spec.Columns {
				w := widths[i]
				if w <= 0 {
					w = pageWidth / float64(len(spec.Columns))
				}
				cellValue := ""
				if rawTitle, ok := col["field"]; ok {
					fieldName := fmt.Sprint(rawTitle)
					if fieldValue := resolvePath(row, fieldName); fieldValue != nil {
						cellValue = renderTemplateText(fmt.Sprint(fieldValue), data)
					}
				} else if i == 0 {
					cellValue = fmt.Sprintf("%d", idx+1)
				}
				pdf.CellFormat(w, 5.5, cellValue, "1", 0, "L", false, 0, "")
			}
			pdf.Ln(-1)
		}
	}

	buf := new(bytes.Buffer)
	if err := pdf.Output(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (h *AiHandler) analyzeSamplePdf(params map[string]any) map[string]any {
	pdfBytes, src, err := h.resolveSamplePdfInput(params)
	if err != nil || len(pdfBytes) == 0 {
		return nil
	}

	tmpRoot := filepath.Join(h.cfg.NativeDataDir, "tmp", "report_template_sample")
	if mkErr := os.MkdirAll(tmpRoot, 0o755); mkErr != nil {
		return map[string]any{"source": src, "error": mkErr.Error()}
	}
	workDir, err := os.MkdirTemp(tmpRoot, "samplepdf-")
	if err != nil {
		return map[string]any{"source": src, "error": err.Error()}
	}
	defer os.RemoveAll(workDir)

	inputPDF := filepath.Join(workDir, "sample.pdf")
	if err := os.WriteFile(inputPDF, pdfBytes, 0o644); err != nil {
		return map[string]any{"source": src, "error": err.Error()}
	}

	dims, dimErr := api.PageDimsFile(inputPDF)
	if dimErr != nil {
		return map[string]any{"source": src, "error": dimErr.Error()}
	}
	pageCount := len(dims)
	maxPages := 3
	if maxPages > pageCount {
		maxPages = pageCount
	}
	selectedPages := make([]string, 0, maxPages)
	for i := 1; i <= maxPages; i++ {
		selectedPages = append(selectedPages, strconv.Itoa(i))
	}

	extractDir := filepath.Join(workDir, "content")
	_ = os.MkdirAll(extractDir, 0o755)
	_ = api.ExtractContentFile(inputPDF, extractDir, selectedPages, nil)

	orderedLines := make([]string, 0, 200)
	for page := 1; page <= maxPages; page++ {
		contentFile := filepath.Join(extractDir, fmt.Sprintf("sample_Content_page_%d.txt", page))
		b, readErr := os.ReadFile(contentFile)
		if readErr != nil || len(b) == 0 {
			continue
		}
		pageBoxes := parsePDFContentLineBoxes(string(b), page)
		for _, item := range pageBoxes {
			t := strings.TrimSpace(item.Text)
			if t != "" {
				orderedLines = append(orderedLines, t)
			}
			if len(orderedLines) >= 120 {
				break
			}
		}
	}

	pages := make([]map[string]any, 0, pageCount)
	for i := 0; i < pageCount; i++ {
		pages = append(pages, map[string]any{"page": i + 1, "width": dims[i].Width, "height": dims[i].Height})
	}
	return map[string]any{
		"source":        src,
		"pageCount":     pageCount,
		"pages":         pages,
		"orderedLines":  orderedLines,
		"analyzedAtUtc": time.Now().UTC().Format(time.RFC3339),
	}
}

func (h *AiHandler) resolveSamplePdfInput(params map[string]any) ([]byte, string, error) {
	for _, key := range []string{"samplePdfPath", "pdfPath"} {
		pdfPath := normalizeDocxSourcePath(paramStr(params, key))
		if pdfPath == "" {
			continue
		}
		lower := strings.ToLower(pdfPath)
		if strings.HasSuffix(lower, ".docx") || strings.HasSuffix(lower, ".doc") {
			return nil, "", fmt.Errorf("SAMPLE_PDF_REQUIRED")
		}
		if !strings.HasSuffix(lower, ".pdf") {
			return nil, "", fmt.Errorf("SAMPLE_PDF_REQUIRED")
		}
		if !isAllowedDocxSourcePath(pdfPath) {
			return nil, "", fmt.Errorf("%s must be under app_images/ or reports/", key)
		}
		if h.rm != nil {
			if p := h.rm.GetStaticFile(pdfPath); p != "" {
				if bytesData, err := os.ReadFile(p); err == nil {
					return bytesData, pdfPath, nil
				}
			}
		}
		publicFallback := filepath.Join(h.cfg.DataDir, "public", filepath.FromSlash(pdfPath))
		if bytesData, err := os.ReadFile(publicFallback); err == nil {
			return bytesData, pdfPath, nil
		}
		return nil, "", fmt.Errorf("%s not found: %s", key, pdfPath)
	}

	for _, key := range []string{"samplePdfDataUrl", "pdfDataUrl"} {
		dataURL := strings.TrimSpace(paramStr(params, key))
		if dataURL == "" {
			continue
		}
		if idx := strings.Index(dataURL, ","); idx > 0 {
			dataURL = dataURL[idx+1:]
		}
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(dataURL))
		if err != nil {
			return nil, "", fmt.Errorf("invalid %s base64", key)
		}
		if !bytes.HasPrefix(decoded, []byte("%PDF")) {
			return nil, "", fmt.Errorf("SAMPLE_PDF_REQUIRED")
		}
		return decoded, key, nil
	}

	for _, key := range []string{"samplePdfBase64", "pdfBase64"} {
		rawBase64 := strings.TrimSpace(paramStr(params, key))
		if rawBase64 == "" {
			continue
		}
		decoded, err := base64.StdEncoding.DecodeString(rawBase64)
		if err != nil {
			return nil, "", fmt.Errorf("invalid %s", key)
		}
		if !bytes.HasPrefix(decoded, []byte("%PDF")) {
			return nil, "", fmt.Errorf("SAMPLE_PDF_REQUIRED")
		}
		return decoded, key, nil
	}

	return nil, "", fmt.Errorf("missing sample pdf input")
}

func registerTemplateFont(pdf *gofpdf.Fpdf) error {
	_ = pdf
	return nil
}

func renderTemplateText(input string, data map[string]any) string {
	return reportTemplateTokenPattern.ReplaceAllStringFunc(input, func(token string) string {
		parts := reportTemplateTokenPattern.FindStringSubmatch(token)
		if len(parts) < 2 {
			return token
		}
		if v := resolvePath(data, parts[1]); v != nil {
			return fmt.Sprint(v)
		}
		return ""
	})
}

func findReportFontPath(name string) string {
	wd, err := os.Getwd()
	searchRoots := []string{}
	if err == nil {
		for _, root := range []string{wd, filepath.Join(wd, ".."), filepath.Join(wd, "..", ".."), filepath.Join(wd, "..", "..", ".."), "/Volumes/Datas/CSM/JavaProjects/csm_server"} {
			searchRoots = append(searchRoots, filepath.Join(root, "go-pdf-maroto", "fonts", name))
		}
	}
	searchRoots = append(searchRoots,
		"/Volumes/Datas/CSM/JavaProjects/csm_server/go-pdf-maroto/fonts/"+name,
		filepath.Join("..", "go-pdf-maroto", "fonts", name),
		filepath.Join("..", "..", "go-pdf-maroto", "fonts", name),
	)
	for _, root := range searchRoots {
		if _, err := os.Stat(root); err == nil {
			if wd != "" {
				if rel, relErr := filepath.Rel(wd, root); relErr == nil {
					return filepath.Clean(rel)
				}
			}
			return root
		}
	}
	return ""
}

func totalWidth(widths []float64) float64 {
	sum := 0.0
	for _, w := range widths {
		sum += w
	}
	return sum
}
