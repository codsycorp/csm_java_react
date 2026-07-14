package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jung-kurt/gofpdf"
	"github.com/pdfcpu/pdfcpu/pkg/api"
)

var reportTemplateTokenPattern = regexp.MustCompile(`\{([a-zA-Z0-9_.-]+)\}`)
var reportCompareTextPattern = regexp.MustCompile(`[^a-z0-9\s]+`)

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
	renderMode := ""
	if previewMode {
		relPath = fmt.Sprintf("app_images/%s/%s", appID, outputName)
		var renderErr error
		if dynamicSpecOk {
			pdfBytes, renderMode, renderErr = renderDynamicDesignSpecWithFallbackToBytes(specData, dataMap)
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
			pdfBytes, renderMode, renderErr = renderDynamicDesignSpecWithFallbackToBytes(specData, dataMap)
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
		if strings.TrimSpace(renderMode) != "" {
			result["renderMode"] = renderMode
		}
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

func (h *AiHandler) handleAiLocalRenderTemplateCompare(params map[string]any) map[string]any {
	sampleBytes, sampleSrc, sampleErr := h.resolveSamplePdfInput(params)
	if sampleErr != nil {
		return map[string]any{"success": false, "errorCode": "SAMPLE_PDF_REQUIRED", "message": sampleErr.Error()}
	}
	renderedBytes, renderedSrc, renderedErr := h.resolveRenderedPdfInput(params)
	if renderedErr != nil {
		return map[string]any{"success": false, "errorCode": "RENDERED_PDF_REQUIRED", "message": renderedErr.Error()}
	}

	sampleLines, sampleMeta, err := h.extractPdfLineBoxesFromBytes(sampleBytes, "sample")
	if err != nil {
		return map[string]any{"success": false, "errorCode": "SAMPLE_PDF_PARSE_FAILED", "message": err.Error()}
	}
	renderedLines, renderedMeta, err := h.extractPdfLineBoxesFromBytes(renderedBytes, "rendered")
	if err != nil {
		return map[string]any{"success": false, "errorCode": "RENDERED_PDF_PARSE_FAILED", "message": err.Error()}
	}

	compare := comparePdfLineLayouts(sampleLines, renderedLines)
	result := map[string]any{
		"success":             true,
		"message":             "render_template_compare_ready",
		"sampleSource":        sampleSrc,
		"renderedSource":      renderedSrc,
		"sampleMeta":          sampleMeta,
		"renderedMeta":        renderedMeta,
		"textCoveragePercent": compare.CoveragePercent,
		"matchedLines":        compare.Matched,
		"sampleLineCount":     compare.SampleCount,
		"renderedLineCount":   compare.RenderedCount,
		"positionDriftMm": map[string]any{
			"avg": compare.DriftAvg,
			"p95": compare.DriftP95,
			"max": compare.DriftMax,
		},
		"missingSampleLines":    compare.Missing,
		"unexpectedRenderLines": compare.Unexpected,
		"comparedAtUtc":         time.Now().UTC().Format(time.RFC3339),
	}
	if compare.CoveragePercent >= 80 && compare.DriftP95 <= 6 {
		result["qualityGate"] = "pass"
	} else {
		result["qualityGate"] = "needs_tuning"
	}
	return result
}

func (h *AiHandler) resolveRenderedPdfInput(params map[string]any) ([]byte, string, error) {
	for _, key := range []string{"renderedPdfPath", "generatedPdfPath"} {
		pdfPath := normalizeDocxSourcePath(paramStr(params, key))
		if pdfPath == "" {
			continue
		}
		if !strings.HasSuffix(strings.ToLower(pdfPath), ".pdf") {
			return nil, "", fmt.Errorf("%s must be a .pdf", key)
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

	for _, key := range []string{"renderedPdfDataUrl", "generatedPdfDataUrl"} {
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
			return nil, "", fmt.Errorf("%s must be pdf", key)
		}
		return decoded, key, nil
	}

	for _, key := range []string{"renderedPdfBase64", "generatedPdfBase64"} {
		rawBase64 := strings.TrimSpace(paramStr(params, key))
		if rawBase64 == "" {
			continue
		}
		decoded, err := base64.StdEncoding.DecodeString(rawBase64)
		if err != nil {
			return nil, "", fmt.Errorf("invalid %s", key)
		}
		if !bytes.HasPrefix(decoded, []byte("%PDF")) {
			return nil, "", fmt.Errorf("%s must be pdf", key)
		}
		return decoded, key, nil
	}

	if bytesData, src, err := h.resolvePdfInput(params); err == nil {
		if bytes.HasPrefix(bytesData, []byte("%PDF")) {
			return bytesData, src, nil
		}
	}

	return nil, "", fmt.Errorf("missing rendered pdf input")
}

func (h *AiHandler) extractPdfLineBoxesFromBytes(pdfBytes []byte, prefix string) ([]pdfExtractLineBox, map[string]any, error) {
	if len(pdfBytes) == 0 {
		return nil, nil, fmt.Errorf("empty pdf bytes")
	}
	tmpRoot := filepath.Join(h.cfg.NativeDataDir, "tmp", "report_template_compare")
	if err := os.MkdirAll(tmpRoot, 0o755); err != nil {
		return nil, nil, err
	}
	workDir, err := os.MkdirTemp(tmpRoot, prefix+"-")
	if err != nil {
		return nil, nil, err
	}
	defer os.RemoveAll(workDir)

	inputPDF := filepath.Join(workDir, "input.pdf")
	if err := os.WriteFile(inputPDF, pdfBytes, 0o644); err != nil {
		return nil, nil, err
	}

	dims, err := api.PageDimsFile(inputPDF)
	if err != nil {
		return nil, nil, err
	}
	pageCount := len(dims)
	maxPages := pageCount
	if maxPages > 3 {
		maxPages = 3
	}
	selectedPages := make([]string, 0, maxPages)
	for i := 1; i <= maxPages; i++ {
		selectedPages = append(selectedPages, strconv.Itoa(i))
	}

	extractDir := filepath.Join(workDir, "content")
	_ = os.MkdirAll(extractDir, 0o755)
	if err := api.ExtractContentFile(inputPDF, extractDir, selectedPages, nil); err != nil {
		return nil, nil, err
	}

	lineBoxes := make([]pdfExtractLineBox, 0, 300)
	orderedLines := make([]string, 0, 200)
	for page := 1; page <= maxPages; page++ {
		contentFile := filepath.Join(extractDir, fmt.Sprintf("input_Content_page_%d.txt", page))
		b, readErr := os.ReadFile(contentFile)
		if readErr != nil || len(b) == 0 {
			continue
		}
		pageBoxes := parsePDFContentLineBoxes(string(b), page)
		lineBoxes = append(lineBoxes, pageBoxes...)
		for _, item := range pageBoxes {
			t := strings.TrimSpace(item.Text)
			if t != "" {
				orderedLines = append(orderedLines, t)
			}
			if len(orderedLines) >= 200 {
				break
			}
		}
	}

	meta := map[string]any{
		"pageCount": pageCount,
		"maxPages":  maxPages,
		"pageWidth": func() float64 {
			if len(dims) > 0 {
				return dims[0].Width
			}
			return 0
		}(),
		"pageHeight": func() float64 {
			if len(dims) > 0 {
				return dims[0].Height
			}
			return 0
		}(),
		"orderedLines": orderedLines,
	}
	return lineBoxes, meta, nil
}

type pdfLayoutCompareResult struct {
	CoveragePercent float64
	Matched         int
	SampleCount     int
	RenderedCount   int
	DriftAvg        float64
	DriftP95        float64
	DriftMax        float64
	Missing         []string
	Unexpected      []string
}

func comparePdfLineLayouts(sample []pdfExtractLineBox, rendered []pdfExtractLineBox) pdfLayoutCompareResult {
	sampleNorm := make([]pdfExtractLineBox, 0, len(sample))
	renderNorm := make([]pdfExtractLineBox, 0, len(rendered))

	for _, box := range sample {
		t := normalizeCompareText(box.Text)
		if t == "" {
			continue
		}
		box.Text = t
		sampleNorm = append(sampleNorm, box)
	}
	for _, box := range rendered {
		t := normalizeCompareText(box.Text)
		if t == "" {
			continue
		}
		box.Text = t
		renderNorm = append(renderNorm, box)
	}

	renderByKey := map[string][]pdfExtractLineBox{}
	for _, box := range renderNorm {
		renderByKey[box.Text] = append(renderByKey[box.Text], box)
	}

	drifts := make([]float64, 0, len(sampleNorm))
	missing := make([]string, 0, 10)
	matched := 0
	for _, box := range sampleNorm {
		candidates := renderByKey[box.Text]
		if len(candidates) == 0 {
			if len(missing) < 12 {
				missing = append(missing, box.Text)
			}
			continue
		}
		bestIdx := 0
		bestDist := math.MaxFloat64
		for i, c := range candidates {
			if c.Page != box.Page {
				continue
			}
			dx := c.X - box.X
			dy := c.Y - box.Y
			d := math.Sqrt(dx*dx + dy*dy)
			if d < bestDist {
				bestDist = d
				bestIdx = i
			}
		}
		if bestDist == math.MaxFloat64 {
			bestDist = 0
		}
		matched++
		drifts = append(drifts, bestDist*25.4/72.0)
		picked := candidates[bestIdx]
		updated := append(candidates[:bestIdx], candidates[bestIdx+1:]...)
		renderByKey[box.Text] = updated
		_ = picked
	}

	unexpected := make([]string, 0, 12)
	for key, list := range renderByKey {
		if len(list) == 0 {
			continue
		}
		if len(unexpected) >= 12 {
			break
		}
		unexpected = append(unexpected, key)
	}

	sort.Float64s(drifts)
	driftAvg := 0.0
	for _, d := range drifts {
		driftAvg += d
	}
	if len(drifts) > 0 {
		driftAvg /= float64(len(drifts))
	}
	driftP95 := 0.0
	if len(drifts) > 0 {
		idx := int(math.Ceil(float64(len(drifts))*0.95)) - 1
		if idx < 0 {
			idx = 0
		}
		if idx >= len(drifts) {
			idx = len(drifts) - 1
		}
		driftP95 = drifts[idx]
	}
	driftMax := 0.0
	if len(drifts) > 0 {
		driftMax = drifts[len(drifts)-1]
	}
	coverage := 0.0
	if len(sampleNorm) > 0 {
		coverage = float64(matched) * 100 / float64(len(sampleNorm))
	}

	return pdfLayoutCompareResult{
		CoveragePercent: math.Round(coverage*100) / 100,
		Matched:         matched,
		SampleCount:     len(sampleNorm),
		RenderedCount:   len(renderNorm),
		DriftAvg:        math.Round(driftAvg*100) / 100,
		DriftP95:        math.Round(driftP95*100) / 100,
		DriftMax:        math.Round(driftMax*100) / 100,
		Missing:         missing,
		Unexpected:      unexpected,
	}
}

func normalizeCompareText(text string) string {
	clean := strings.ToLower(strings.TrimSpace(text))
	if clean == "" {
		return ""
	}
	clean = strings.ReplaceAll(clean, "\u00a0", " ")
	clean = reportCompareTextPattern.ReplaceAllString(clean, " ")
	clean = strings.Join(strings.Fields(clean), " ")
	return strings.TrimSpace(clean)
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
	pdfBytes, _, err := renderDynamicDesignSpecWithFallbackToBytes(spec, data)
	if err != nil {
		return err
	}
	return os.WriteFile(outputPath, pdfBytes, 0o644)
}

func renderDynamicDesignSpecWithFallbackToBytes(spec map[string]any, data map[string]any) ([]byte, string, error) {
	pdfBytes, err := renderDynamicDesignSpecPDFToBytes(spec, data)
	if err == nil {
		return pdfBytes, "primary", nil
	}
	if !isQuotationGroupedSpec(spec) {
		return nil, "primary", err
	}

	alt := cloneReportMapAny(spec)
	alt["layoutKind"] = "dynamic-pdf-template"
	table := cloneReportMapAny(toMapAny(alt["table"]))
	table["grouped"] = false
	alt["table"] = table

	fallbackBytes, fallbackErr := renderDynamicDesignSpecPDFToBytes(alt, data)
	if fallbackErr != nil {
		return nil, "fallback_failed", err
	}
	return fallbackBytes, "fallback_dynamic_table", nil
}

func cloneReportMapAny(input map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range input {
		out[k] = v
	}
	return out
}

func renderDynamicDesignSpecPDFToBytes(spec map[string]any, data map[string]any) ([]byte, error) {
	if overlayItems := parseReportCanvasTextItems(spec); len(overlayItems) > 0 {
		return renderOverlayTemplateSpecPDFToBytes(spec, data, overlayItems)
	}

	if isQuotationGroupedSpec(spec) {
		return renderQuotationGroupedDesignSpecPDFToBytes(spec, data)
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(12, 12, 12)
	pdf.SetAutoPageBreak(true, 12)
	pdf.AddPage()
	fontName := registerTemplateFont(pdf)

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

	if tableMap := toMapAny(spec["table"]); len(tableMap) > 0 {
		renderDynamicDesignSpecTable(pdf, tableMap, data)
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

func isQuotationGroupedSpec(spec map[string]any) bool {
	layoutKind := strings.ToLower(strings.TrimSpace(fmt.Sprint(spec["layoutKind"])))
	if strings.Contains(layoutKind, "quotation") || strings.Contains(layoutKind, "grouped-table") {
		return true
	}
	table := toMapAny(spec["table"])
	return boolFromAny(table["grouped"])
}

func renderQuotationGroupedDesignSpecPDFToBytes(spec map[string]any, data map[string]any) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(10, 10, 10)
	pdf.SetAutoPageBreak(true, 12)
	fontName := registerTemplateFont(pdf)

	company := toMapAny(spec["company"])
	table := toMapAny(spec["table"])
	notes := stringSliceFromAny(spec["notes"])
	paymentTerms := stringSliceFromAny(spec["paymentTerms"])

	companyName := renderFirstTemplateValue(data, fmt.Sprint(company["name"]), "{company.name}", "{ten_cong_ty}", "{company_name}")
	if strings.TrimSpace(companyName) == "" {
		companyName = "CÔNG TY"
	}
	companyAddress := renderFirstTemplateValue(data, fmt.Sprint(company["address"]), "{company.address}", "{company_address}")
	taxCode := renderFirstTemplateValue(data, fmt.Sprint(company["taxCode"]), "{company.tax_code}", "{tax_code}")
	website := renderFirstTemplateValue(data, fmt.Sprint(company["website"]), "{company.website}", "{website}")

	pdf.SetHeaderFunc(func() {
		pdf.SetFont(fontName, "B", 10)
		pdf.CellFormat(130, 5, companyName, "", 0, "L", false, 0, "")
		pdf.SetFont(fontName, "", 9)
		pdf.CellFormat(60, 5, strings.TrimSpace("MST: "+taxCode), "", 1, "R", false, 0, "")

		pdf.SetFont(fontName, "I", 8)
		if companyAddress != "" {
			pdf.CellFormat(190, 4, "Địa chỉ: "+companyAddress, "", 1, "L", false, 0, "")
		}

		pdf.SetFont(fontName, "", 8)
		if website != "" {
			websiteLine := website
			if !strings.Contains(strings.ToLower(websiteLine), "http") {
				websiteLine = "Website: " + websiteLine
			}
			pdf.CellFormat(190, 4, websiteLine, "", 1, "L", false, 0, "")
		}

		currX, currY := pdf.GetX(), pdf.GetY()
		pdf.Line(currX, currY+1, 200, currY+1)
		pdf.Ln(4)
	})

	pdf.SetFooterFunc(func() {
		pdf.SetY(-15)
		pdf.SetFont(fontName, "", 8)
		pageStr := fmt.Sprintf("Trang %d / {nb}", pdf.PageNo())
		pdf.CellFormat(190, 10, pageStr, "", 0, "R", false, 0, "")
	})
	pdf.AliasNbPages("")

	pdf.AddPage()
	pdf.Ln(2)
	pdf.SetFont(fontName, "B", 13)
	title := renderFirstTemplateValue(data, fmt.Sprint(spec["title"]), "{report_title}", "BÁO CÁO")
	pdf.CellFormat(190, 7, title, "", 1, "C", false, 0, "")
	pdf.Ln(3)

	renderQuotationHeaderRows(pdf, fontName, data)

	intro := renderFirstTemplateValue(data, fmt.Sprint(spec["intro"]), "{intro}")
	if strings.TrimSpace(intro) != "" {
		pdf.SetFont(fontName, "", 8.5)
		pdf.MultiCell(190, 4.2, intro, "", "L", false)
		pdf.Ln(2)
	}

	renderQuotationGroupedTable(pdf, fontName, table, data)
	renderQuotationTotals(pdf, fontName, data)
	renderQuotationNotesAndSignatures(pdf, fontName, notes, paymentTerms, data)

	buf := new(bytes.Buffer)
	if err := pdf.Output(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func renderQuotationHeaderRows(pdf *gofpdf.Fpdf, fontName string, data map[string]any) {
	pdf.SetFont(fontName, "B", 9)
	clientCompany := renderFirstTemplateValue(data, "{client.company}", "{customerName}", "{clientName}")
	clientAddress := renderFirstTemplateValue(data, "{client.address}", "{companyAddress}")
	clientContact := renderFirstTemplateValue(data, "{client.contact}", "{contactName}")
	quotationNo := renderFirstTemplateValue(data, "{quotation_no}", "{quotationNo}", "{reportNo}")
	date := renderFirstTemplateValue(data, "{date}", "{reportDate}")
	validUntil := renderFirstTemplateValue(data, "{valid_until}", "{validUntil}")
	sales := renderFirstTemplateValue(data, "{sales.name}", "{salesName}", "{nvkd}")

	pdf.CellFormat(120, 5, "Kính gửi: "+clientCompany, "", 0, "L", false, 0, "")
	pdf.CellFormat(70, 5, "Số: "+quotationNo, "", 1, "R", false, 0, "")

	pdf.SetFont(fontName, "", 9)
	pdf.CellFormat(128, 5, "Địa chỉ: "+clientAddress, "", 0, "L", false, 0, "")
	pdf.CellFormat(62, 5, "Ngày: "+date, "", 1, "R", false, 0, "")

	pdf.CellFormat(120, 5, "Người liên hệ: "+clientContact, "", 0, "L", false, 0, "")
	pdf.CellFormat(70, 5, "Hiệu lực đến: "+validUntil, "", 1, "R", false, 0, "")

	pdf.SetFont(fontName, "B", 9)
	pdf.CellFormat(190, 5, fmt.Sprintf("NVKD: %s", sales), "", 1, "L", false, 0, "")
	pdf.Ln(2)
}

func renderQuotationGroupedTable(pdf *gofpdf.Fpdf, fontName string, table map[string]any, data map[string]any) {
	headers := stringSliceFromAny(table["headers"])
	if len(headers) == 0 {
		headers = []string{"TT", "Tên sản phẩm/Quy cách", "Đơn vị", "Chiều rộng", "Chiều dài", "Số tấm", "Khối lượng", "Đơn giá (VNĐ)", "Thành tiền (VNĐ)"}
	}
	widths := floatSliceFromAny(table["widths"])
	if len(widths) != len(headers) {
		widths = []float64{7, 63, 10, 15, 15, 15, 17, 23, 25}
	}
	if sum := totalWidth(widths); sum > 190 && sum > 0 {
		for i := range widths {
			widths[i] = widths[i] * 190 / sum
		}
	}

	pdf.SetFont(fontName, "B", 7.8)
	for i, header := range headers {
		pdf.CellFormat(widths[i], 8, header, "1", 0, "C", false, 0, "")
	}
	pdf.Ln(-1)

	items := renderRowsFromData(data)
	groups := groupQuotationItems(items)
	for groupIndex, group := range groups {
		roman := getReportRomanNumeral(groupIndex + 1)
		renderQuotationGroupHeader(pdf, fontName, widths[0], roman, group.Title, group.Desc)

		groupQty := 0
		groupWeight := 0.0
		groupAmount := 0.0
		vatRate := group.VatRate
		pdf.SetFont(fontName, "", 7.8)
		for rowIndex, row := range group.Rows {
			qty := int(numberFromAny(firstResolved(row, "quantity", "qty", "so_tam")))
			weight := quotationItemWeight(row)
			unitPrice := numberFromAny(firstResolved(row, "unit_price", "unitPrice", "don_gia"))
			amount := numberFromAny(firstResolved(row, "amount", "thanh_tien"))
			if amount == 0 {
				amount = weight * unitPrice
			}
			groupQty += qty
			groupWeight += weight
			groupAmount += amount

			cells := []string{
				strconv.Itoa(rowIndex + 1),
				stringFromAny(firstResolved(row, "name", "ten_san_pham", "product_name")),
				stringFromAny(firstResolved(row, "unit", "don_vi")),
				formatDimension(firstResolved(row, "width", "chieu_rong"), 2),
				formatDimension(firstResolved(row, "length", "chieu_dai"), 3),
				formatIntCell(qty),
				formatDecimal(weight, 2),
				reportFormatMoney(unitPrice),
				reportFormatMoney(amount),
			}
			renderQuotationTableRow(pdf, fontName, widths, cells, false)
		}

		label := fmt.Sprintf("Cộng nhóm %s - chưa VAT %.0f%%", roman, vatRate)
		cells := []string{label, "", "", "", formatIntCell(groupQty), formatDecimal(groupWeight, 2), "", reportFormatMoney(groupAmount)}
		renderQuotationSubtotalRow(pdf, fontName, widths, cells)
	}
}

func renderQuotationGroupHeader(pdf *gofpdf.Fpdf, fontName string, indexWidth float64, roman, title, desc string) {
	contentWidth := 190 - indexWidth
	lineHeight := 4.2
	titleText := strings.TrimSpace(title)
	descText := strings.TrimSpace(desc)
	content := titleText
	if descText != "" {
		content += "\n" + descText
	}
	if content == "" {
		content = "Nội dung"
	}
	lines := 0
	for _, part := range strings.Split(content, "\n") {
		partLines := pdf.SplitLines([]byte(part), contentWidth-2)
		if len(partLines) == 0 {
			lines++
		} else {
			lines += len(partLines)
		}
	}
	rowHeight := lineHeight * float64(maxInt(1, lines))
	startX, startY := pdf.GetX(), pdf.GetY()
	pdf.SetFont(fontName, "B", 8.1)
	pdf.CellFormat(indexWidth, rowHeight, roman+".", "1", 0, "C", false, 0, "")
	pdf.SetXY(startX+indexWidth, startY)
	pdf.MultiCell(contentWidth, lineHeight, " "+content, "1", "L", false)
	pdf.SetXY(startX, startY+rowHeight)
}

func renderQuotationTableRow(pdf *gofpdf.Fpdf, fontName string, widths []float64, cells []string, bold bool) {
	if bold {
		pdf.SetFont(fontName, "B", 7.8)
	} else {
		pdf.SetFont(fontName, "", 7.8)
	}
	lineHeight := 5.2
	nameLines := pdf.SplitLines([]byte(cells[1]), widths[1]-1)
	rowHeight := lineHeight * float64(maxInt(1, len(nameLines)))
	startX, startY := pdf.GetX(), pdf.GetY()
	for i, cell := range cells {
		align := "L"
		if i == 0 || i >= 2 {
			align = "C"
		}
		if i >= 6 {
			align = "R"
		}
		x := startX
		for col := 0; col < i; col++ {
			x += widths[col]
		}
		pdf.SetXY(x, startY)
		if i == 1 && len(nameLines) > 1 {
			pdf.MultiCell(widths[i], lineHeight, cell, "1", align, false)
		} else {
			pdf.CellFormat(widths[i], rowHeight, cell, "1", 0, align, false, 0, "")
		}
	}
	pdf.SetXY(startX, startY+rowHeight)
}

func renderQuotationSubtotalRow(pdf *gofpdf.Fpdf, fontName string, widths []float64, cells []string) {
	pdf.SetFont(fontName, "B", 7.8)
	pdf.CellFormat(widths[0]+widths[1], 5.8, cells[0], "1", 0, "L", false, 0, "")
	pdf.CellFormat(widths[2], 5.8, cells[1], "1", 0, "C", false, 0, "")
	pdf.CellFormat(widths[3], 5.8, cells[2], "1", 0, "C", false, 0, "")
	pdf.CellFormat(widths[4], 5.8, cells[3], "1", 0, "C", false, 0, "")
	pdf.CellFormat(widths[5], 5.8, cells[4], "1", 0, "C", false, 0, "")
	pdf.CellFormat(widths[6], 5.8, cells[5], "1", 0, "R", false, 0, "")
	pdf.CellFormat(widths[7], 5.8, cells[6], "1", 0, "R", false, 0, "")
	pdf.CellFormat(widths[8], 5.8, cells[7], "1", 1, "R", false, 0, "")
}

func renderQuotationTotals(pdf *gofpdf.Fpdf, fontName string, data map[string]any) {
	items := renderRowsFromData(data)
	totalBeforeVat := 0.0
	vatAmounts := map[float64]float64{}
	for _, itemAny := range items {
		row := toMapAny(itemAny)
		weight := quotationItemWeight(row)
		unitPrice := numberFromAny(firstResolved(row, "unit_price", "unitPrice", "don_gia"))
		amount := numberFromAny(firstResolved(row, "amount", "thanh_tien"))
		if amount == 0 {
			amount = weight * unitPrice
		}
		vatRate := numberFromAny(firstResolved(row, "vat_rate", "vatRate", "thue_vat"))
		totalBeforeVat += amount
		vatAmounts[vatRate] += amount * vatRate / 100
	}
	totalVat := 0.0
	for _, amount := range vatAmounts {
		totalVat += amount
	}
	totalPayment := totalBeforeVat + totalVat

	pdf.Ln(2)
	pdf.SetFont(fontName, "B", 8.5)
	renderTotalLine(pdf, "A", "Tổng giá trị hàng hóa chưa VAT:", totalBeforeVat)
	for _, rate := range sortedVatRates(vatAmounts) {
		if rate <= 0 {
			continue
		}
		label := fmt.Sprintf("Tiền VAT %.0f%%", rate)
		prefix := "B"
		if rate >= 10 {
			prefix = "C"
		}
		renderTotalLine(pdf, prefix, label, vatAmounts[rate])
	}
	renderTotalLine(pdf, "D", "Tổng giá trị thanh toán, đã bao gồm VAT: D = (A)+(B)+(C)", totalPayment)
}

func renderTotalLine(pdf *gofpdf.Fpdf, prefix, label string, amount float64) {
	pdf.CellFormat(165, 5, fmt.Sprintf("%s. %s", prefix, label), "", 0, "R", false, 0, "")
	pdf.CellFormat(25, 5, reportFormatMoney(amount), "", 1, "R", false, 0, "")
}

func renderQuotationNotesAndSignatures(pdf *gofpdf.Fpdf, fontName string, notes []string, paymentTerms []string, data map[string]any) {
	pdf.Ln(2)
	amountText := renderFirstTemplateValue(data, "{amount_words}", "{bang_chu}")
	if amountText != "" {
		pdf.SetFont(fontName, "B", 8.5)
		pdf.CellFormat(190, 5, "Bằng chữ: "+amountText, "", 1, "L", false, 0, "")
	}
	if len(notes) > 0 {
		pdf.SetFont(fontName, "B", 8)
		pdf.CellFormat(190, 4, "Ghi chú:", "", 1, "L", false, 0, "")
		pdf.SetFont(fontName, "", 7.5)
		for _, note := range notes {
			pdf.MultiCell(190, 4, renderTemplateText(note, data), "", "L", false)
		}
	}
	if len(paymentTerms) > 0 {
		pdf.SetFont(fontName, "", 8)
		pdf.CellFormat(190, 4, "Phương thức thanh toán:", "", 1, "L", false, 0, "")
		pdf.SetFont(fontName, "", 8)
		for _, line := range paymentTerms {
			pdf.MultiCell(190, 4, renderTemplateText(line, data), "", "L", false)
		}
	}

	pdf.Ln(1)
	pdf.SetFont(fontName, "", 8)
	bankInfo := renderFirstTemplateValue(
		data,
		"{bank_info}",
	)
	if strings.TrimSpace(bankInfo) != "" {
		pdf.SetFont(fontName, "B", 8)
		pdf.CellFormat(190, 4, "Thông tin thanh toán:", "", 1, "L", false, 0, "")
		pdf.SetFont(fontName, "", 8)
		pdf.MultiCell(190, 4, bankInfo, "", "L", false)
	}
	pdf.Ln(2)
	pdf.SetFont(fontName, "B", 8.5)
	buyerLabel := renderFirstTemplateValue(data, "{signature.buyer_label}", "{buyer_label}", "ĐẠI DIỆN BÊN MUA")
	sellerLabel := renderFirstTemplateValue(data, "{signature.seller_label}", "{seller_label}", "ĐẠI DIỆN BÊN BÁN")
	pdf.CellFormat(95, 5, buyerLabel, "", 0, "C", false, 0, "")
	pdf.CellFormat(95, 5, sellerLabel, "", 1, "C", false, 0, "")
	pdf.Ln(14)
	pdf.CellFormat(95, 5, "", "", 0, "C", false, 0, "")
	pdf.CellFormat(95, 5, renderTemplateText("{sales.name}", data), "", 1, "C", false, 0, "")
}

type reportCanvasTextItem struct {
	Page     int
	X        float64
	Y        float64
	Width    float64
	Align    string
	FontName string
	Bold     bool
	Italic   bool
	FontSize float64
	Color    string
	Text     string
}

func parseReportCanvasTextItems(spec map[string]any) []reportCanvasTextItem {
	raw := spec["overlayItems"]
	if raw == nil {
		raw = spec["overlaySummary"]
	}
	list, ok := raw.([]any)
	if !ok || len(list) == 0 {
		return nil
	}
	out := make([]reportCanvasTextItem, 0, len(list))
	for _, itemAny := range list {
		item := toMapAny(itemAny)
		text := strings.TrimSpace(fmt.Sprint(item["text"]))
		if text == "" {
			continue
		}
		align := strings.ToUpper(strings.TrimSpace(fmt.Sprint(item["align"])))
		if align != "C" && align != "R" {
			align = "L"
		}
		fontName := strings.TrimSpace(fmt.Sprint(item["fontName"]))
		if fontName == "" {
			fontName = "Arial"
		}
		out = append(out, reportCanvasTextItem{
			Page:     maxInt(1, int(numberFromAny(item["page"]))),
			X:        numberFromAny(item["x"]),
			Y:        numberFromAny(item["y"]),
			Width:    numberFromAny(item["width"]),
			Align:    align,
			FontName: fontName,
			Bold:     boolFromAny(item["bold"]),
			Italic:   boolFromAny(item["italic"]),
			FontSize: numberFromAny(item["fontSize"]),
			Color:    strings.TrimSpace(fmt.Sprint(item["color"])),
			Text:     text,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Page != out[j].Page {
			return out[i].Page < out[j].Page
		}
		if out[i].Y != out[j].Y {
			return out[i].Y < out[j].Y
		}
		return out[i].X < out[j].X
	})
	return out
}

func renderOverlayTemplateSpecPDFToBytes(spec map[string]any, data map[string]any, items []reportCanvasTextItem) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(10, 10, 10)
	pdf.SetAutoPageBreak(true, 12)
	fontName := registerTemplateFont(pdf)
	coord := buildReportCoordinateMeta(spec, items)
	pageCount := 1
	for _, item := range items {
		if item.Page > pageCount {
			pageCount = item.Page
		}
	}

	for page := 1; page <= pageCount; page++ {
		pdf.AddPage()
		pageMaxY := 0.0
		for _, item := range items {
			if item.Page != page {
				continue
			}
			rendered := renderTemplateText(item.Text, data)
			if strings.TrimSpace(rendered) == "" {
				continue
			}
			style := ""
			if item.Bold {
				style += "B"
			}
			if item.Italic {
				style += "I"
			}
			activeFont := resolveReportCanvasFontName(fontName, item.FontName)
			fontSize := item.FontSize
			if fontSize <= 0 {
				fontSize = 10
			}
			pdf.SetFont(activeFont, style, fontSize)
			if r, g, b, ok := parseHexColor(item.Color); ok {
				pdf.SetTextColor(r, g, b)
			} else {
				pdf.SetTextColor(0, 0, 0)
			}

			x, y := coord.toPDFMM(item.X, item.Y)
			if x <= 0 {
				x = 10
			}
			if y <= 0 {
				y = 10
			}
			lineHeight := fontSize * 0.45
			if lineHeight < 4 {
				lineHeight = 4
			}
			width := item.Width
			if width <= 0 {
				width = 190 - x
				if width <= 0 {
					width = 50
				}
			}
			if y > pageMaxY {
				pageMaxY = y
			}
			pdf.SetXY(x, y)
			pdf.CellFormat(width, lineHeight, rendered, "", 0, item.Align, false, 0, "")
		}

		if tableMap := toMapAny(spec["table"]); len(tableMap) > 0 {
			rawTableX := numberFromAny(firstResolved(tableMap, "x", "startX", "anchor.x"))
			rawTableY := numberFromAny(firstResolved(tableMap, "y", "startY", "anchor.y"))
			tableX, tableY := coord.toPDFMM(rawTableX, rawTableY)
			if tableX <= 0 {
				tableX = 10
			}
			if tableY <= 0 {
				tableY = pageMaxY + 6
			}
			if tableY > 275 {
				tableY = 275
			}
			if page == 1 {
				renderDynamicDesignSpecTableAt(pdf, tableMap, data, tableX, tableY)
			}
		}
	}

	buf := new(bytes.Buffer)
	if err := pdf.Output(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func renderDynamicDesignSpecTableAt(pdf *gofpdf.Fpdf, table map[string]any, data map[string]any, startX, startY float64) {
	headers := stringSliceFromAny(table["headers"])
	fields := stringSliceFromAny(table["fields"])
	if len(headers) == 0 {
		return
	}
	if len(fields) < len(headers) {
		for len(fields) < len(headers) {
			fields = append(fields, fmt.Sprintf("col_%d", len(fields)+1))
		}
	}

	widths := floatSliceFromAny(table["widths"])
	if len(widths) < len(headers) {
		widths = make([]float64, len(headers))
		for i := range widths {
			widths[i] = 190 / float64(len(headers))
		}
	}
	if sum := totalWidth(widths); sum > 190 && sum > 0 {
		for i := range widths {
			widths[i] = widths[i] * 190 / sum
		}
	}

	pdf.SetXY(startX, startY)
	pdf.SetFont("Arial", "B", 8)
	for i, title := range headers {
		pdf.CellFormat(widths[i], 7, renderTemplateText(title, data), "1", 0, "C", false, 0, "")
	}
	pdf.Ln(-1)

	items := renderRowsFromData(data)
	pdf.SetFont("Arial", "", 8)
	for rowIndex, rowAny := range items {
		row := toMapAny(rowAny)
		for colIndex, field := range fields[:len(headers)] {
			value := ""
			if field == "__index" {
				value = strconv.Itoa(rowIndex + 1)
			} else if fieldValue := resolvePath(row, field); fieldValue != nil {
				value = renderTemplateText(fmt.Sprint(fieldValue), data)
			} else if fieldValue := resolvePath(data, field); fieldValue != nil {
				value = renderTemplateText(fmt.Sprint(fieldValue), data)
			}
			align := "L"
			if colIndex == 0 || looksNumericText(value) {
				align = "C"
			}
			if colIndex == len(headers)-1 && looksNumericText(value) {
				align = "R"
			}
			pdf.CellFormat(widths[colIndex], 5.5, value, "1", 0, align, false, 0, "")
		}
		pdf.Ln(-1)
	}
}

func renderDynamicDesignSpecTable(pdf *gofpdf.Fpdf, table map[string]any, data map[string]any) {
	headers := stringSliceFromAny(table["headers"])
	fields := stringSliceFromAny(table["fields"])
	if len(headers) == 0 {
		return
	}
	if len(fields) < len(headers) {
		for len(fields) < len(headers) {
			fields = append(fields, fmt.Sprintf("col_%d", len(fields)+1))
		}
	}

	pageWidth := 186.0
	widths := floatSliceFromAny(table["widths"])
	if len(widths) < len(headers) {
		widths = make([]float64, len(headers))
		for i := range widths {
			widths[i] = pageWidth / float64(len(headers))
		}
	}
	if sum := totalWidth(widths); sum > 0 && sum != pageWidth {
		for i := range widths {
			widths[i] = widths[i] * pageWidth / sum
		}
	}

	pdf.Ln(2)
	pdf.SetFont("Helvetica", "B", 8)
	for i, title := range headers {
		pdf.CellFormat(widths[i], 7, renderTemplateText(title, data), "1", 0, "C", false, 0, "")
	}
	pdf.Ln(-1)

	items := renderRowsFromData(data)
	pdf.SetFont("Helvetica", "", 8)
	for rowIndex, rowAny := range items {
		row := toMapAny(rowAny)
		for colIndex, field := range fields[:len(headers)] {
			value := ""
			if field == "__index" {
				value = strconv.Itoa(rowIndex + 1)
			} else if fieldValue := resolvePath(row, field); fieldValue != nil {
				value = renderTemplateText(fmt.Sprint(fieldValue), data)
			} else if fieldValue := resolvePath(data, field); fieldValue != nil {
				value = renderTemplateText(fmt.Sprint(fieldValue), data)
			}
			align := "L"
			if colIndex == 0 || looksNumericText(value) {
				align = "C"
			}
			pdf.CellFormat(widths[colIndex], 5.5, value, "1", 0, align, false, 0, "")
		}
		pdf.Ln(-1)
	}
}

func stringSliceFromAny(raw any) []string {
	switch list := raw.(type) {
	case []string:
		out := make([]string, 0, len(list))
		for _, item := range list {
			text := strings.TrimSpace(item)
			if text != "" {
				out = append(out, text)
			}
		}
		return out
	case []any:
		out := make([]string, 0, len(list))
		for _, item := range list {
			text := strings.TrimSpace(fmt.Sprint(item))
			if text != "" {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}

func floatSliceFromAny(raw any) []float64 {
	switch list := raw.(type) {
	case []float64:
		out := make([]float64, 0, len(list))
		for _, value := range list {
			if value > 0 {
				out = append(out, value)
			}
		}
		return out
	case []any:
		out := make([]float64, 0, len(list))
		for _, item := range list {
			value, err := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(item)), 64)
			if err == nil && value > 0 {
				out = append(out, value)
			}
		}
		return out
	default:
		return nil
	}
}

func renderRowsFromData(data map[string]any) []any {
	for _, key := range []string{"items", "rows", "list"} {
		if raw := resolvePath(data, key); raw != nil {
			if list, ok := raw.([]any); ok {
				return list
			}
			if list, ok := raw.([]map[string]any); ok {
				out := make([]any, 0, len(list))
				for _, item := range list {
					out = append(out, item)
				}
				return out
			}
		}
	}
	return nil
}

func looksNumericText(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	for _, r := range trimmed {
		if (r < '0' || r > '9') && r != '.' && r != ',' && r != '-' && r != '%' {
			return false
		}
	}
	return true
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

func registerTemplateFont(pdf *gofpdf.Fpdf) string {
	regular := findReportFontPath("Arial.ttf")
	bold := findReportFontPath("Arial-Bold.ttf")
	italic := findReportFontPath("Arial-Italic.ttf")
	boldItalic := findReportFontPath("Arial-BoldItalic.ttf")
	if regular == "" || bold == "" {
		return "Helvetica"
	}
	pdf.AddUTF8Font("Arial", "", regular)
	pdf.AddUTF8Font("Arial", "B", bold)
	if italic != "" {
		pdf.AddUTF8Font("Arial", "I", italic)
	}
	if boldItalic != "" {
		pdf.AddUTF8Font("Arial", "BI", boldItalic)
	}
	return "Arial"
}

type quotationGroup struct {
	Title   string
	Desc    string
	VatRate float64
	Rows    []map[string]any
}

func groupQuotationItems(items []any) []quotationGroup {
	groups := make([]quotationGroup, 0)
	indexByTitle := map[string]int{}
	for _, itemAny := range items {
		row := toMapAny(itemAny)
		if len(row) == 0 {
			continue
		}
		title := stringFromAny(firstResolved(row, "group_title", "groupTitle", "nhom", "group"))
		if title == "" {
			title = "Nội dung"
		}
		idx, exists := indexByTitle[title]
		if !exists {
			idx = len(groups)
			indexByTitle[title] = idx
			groups = append(groups, quotationGroup{
				Title:   title,
				Desc:    stringFromAny(firstResolved(row, "group_desc", "groupDesc", "mo_ta_nhom")),
				VatRate: numberFromAny(firstResolved(row, "vat_rate", "vatRate", "thue_vat")),
				Rows:    []map[string]any{},
			})
		}
		groups[idx].Rows = append(groups[idx].Rows, row)
	}
	return groups
}

func quotationItemWeight(row map[string]any) float64 {
	weight := numberFromAny(firstResolved(row, "weight", "khoi_luong"))
	width := numberFromAny(firstResolved(row, "width", "chieu_rong"))
	length := numberFromAny(firstResolved(row, "length", "chieu_dai"))
	qty := numberFromAny(firstResolved(row, "quantity", "qty", "so_tam"))
	unit := strings.ToLower(stringFromAny(firstResolved(row, "unit", "don_vi")))
	if width > 0 && length > 0 && qty > 0 {
		return width * length * qty
	}
	if length > 0 && qty > 0 && unit == "m" {
		return length * qty
	}
	return weight
}

func firstResolved(row map[string]any, paths ...string) any {
	for _, path := range paths {
		if v := resolvePath(row, path); v != nil {
			return v
		}
	}
	return nil
}

func numberFromAny(value any) float64 {
	switch n := value.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case int32:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	case string:
		cleaned := strings.ReplaceAll(strings.TrimSpace(n), ".", "")
		cleaned = strings.ReplaceAll(cleaned, ",", ".")
		f, _ := strconv.ParseFloat(cleaned, 64)
		return f
	default:
		return 0
	}
}

func stringFromAny(value any) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func boolFromAny(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(strings.TrimSpace(v), "true") || strings.TrimSpace(v) == "1"
	case int, int32, int64, float32, float64:
		return numberFromAny(v) != 0
	default:
		return false
	}
}

func firstReportNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" && trimmed != "<nil>" {
			return trimmed
		}
	}
	return ""
}

func renderFirstTemplateValue(data map[string]any, values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" || trimmed == "<nil>" {
			continue
		}
		rendered := strings.TrimSpace(renderTemplateText(trimmed, data))
		if rendered != "" {
			return rendered
		}
	}
	return ""
}

func formatDimension(value any, decimals int) string {
	n := numberFromAny(value)
	if n == 0 {
		return ""
	}
	return formatDecimal(n, decimals)
}

func formatDecimal(value float64, decimals int) string {
	format := fmt.Sprintf("%%.%df", decimals)
	return strings.ReplaceAll(fmt.Sprintf(format, value), ".", ",")
}

func formatIntCell(value int) string {
	if value == 0 {
		return ""
	}
	return strconv.Itoa(value)
}

func reportFormatMoney(value float64) string {
	if value == 0 {
		return "0"
	}
	s := fmt.Sprintf("%.0f", value)
	res := ""
	cnt := 0
	for i := len(s) - 1; i >= 0; i-- {
		res = string(s[i]) + res
		cnt++
		if cnt == 3 && i > 0 {
			res = "." + res
			cnt = 0
		}
	}
	return res
}

func getReportRomanNumeral(num int) string {
	romans := []string{"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"}
	if num > 0 && num <= len(romans) {
		return romans[num-1]
	}
	return strconv.Itoa(num)
}

func sortedVatRates(vatAmounts map[float64]float64) []float64 {
	rates := make([]float64, 0, len(vatAmounts))
	for rate := range vatAmounts {
		rates = append(rates, rate)
	}
	sort.Float64s(rates)
	return rates
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

func parseHexColor(raw string) (int, int, int, bool) {
	color := strings.TrimSpace(strings.TrimPrefix(raw, "#"))
	if len(color) != 6 {
		return 0, 0, 0, false
	}
	r, errR := strconv.ParseInt(color[0:2], 16, 32)
	g, errG := strconv.ParseInt(color[2:4], 16, 32)
	b, errB := strconv.ParseInt(color[4:6], 16, 32)
	if errR != nil || errG != nil || errB != nil {
		return 0, 0, 0, false
	}
	return int(r), int(g), int(b), true
}

type reportCoordinateMeta struct {
	unit         string
	origin       string
	pageWidthPt  float64
	pageHeightPt float64
}

func buildReportCoordinateMeta(spec map[string]any, items []reportCanvasTextItem) reportCoordinateMeta {
	unit := strings.ToLower(strings.TrimSpace(fmt.Sprint(spec["coordinateUnit"])))
	if unit == "" {
		unit = "pt"
	}
	origin := strings.ToLower(strings.TrimSpace(fmt.Sprint(spec["coordinateOrigin"])))
	if origin == "" {
		origin = "bottom-left"
	}
	meta := reportCoordinateMeta{
		unit:         unit,
		origin:       origin,
		pageWidthPt:  numberFromAny(spec["pageWidth"]),
		pageHeightPt: numberFromAny(spec["pageHeight"]),
	}

	if meta.pageHeightPt <= 0 {
		maxY := 0.0
		for _, item := range items {
			if item.Y > maxY {
				maxY = item.Y
			}
		}
		if maxY > 400 {
			meta.pageHeightPt = 842
		}
	}
	if meta.pageWidthPt <= 0 {
		meta.pageWidthPt = 595
	}
	return meta
}

func (m reportCoordinateMeta) toPDFMM(x, y float64) (float64, float64) {
	if m.unit == "pt" {
		xMM := x * 25.4 / 72.0
		if m.origin == "bottom-left" && m.pageHeightPt > 0 {
			yMM := (m.pageHeightPt - y) * 25.4 / 72.0
			return xMM, yMM
		}
		yMM := y * 25.4 / 72.0
		return xMM, yMM
	}
	return x, y
}

func resolveReportCanvasFontName(defaultFont string, requested string) string {
	name := strings.TrimSpace(requested)
	if name == "" {
		return defaultFont
	}
	if strings.EqualFold(name, "Arial") {
		if strings.EqualFold(defaultFont, "Arial") {
			return "Arial"
		}
		return defaultFont
	}
	switch strings.ToLower(name) {
	case "helvetica":
		return "Helvetica"
	case "times":
		return "Times"
	case "courier":
		return "Courier"
	default:
		return defaultFont
	}
}
