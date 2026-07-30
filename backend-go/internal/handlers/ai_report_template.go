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
var reportPDFRGBColorPattern = regexp.MustCompile(`(?m)([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+(?:rg|RG)\b`)
var reportPDFGrayColorPattern = regexp.MustCompile(`(?m)([-+]?\d*\.?\d+)\s+(?:g|G)\b`)
var reportSampleMSTPattern = regexp.MustCompile(`(?i)^(.*?)\s+MST:\s*([A-Z0-9.-]+)\s*$`)
var reportSampleQuoteNoPattern = regexp.MustCompile(`(?i)^Kính gửi:\s*(.*?)\s+Số:\s*(.+)$`)
var reportSampleDatePattern = regexp.MustCompile(`(?i)^Địa chỉ:\s*(.*?)\s+Ngày:\s*(.+)$`)
var reportSampleContactPattern = regexp.MustCompile(`(?i)^Người liên hệ:\s*(.*?)\s+Hiệu lực đến:\s*(.+)$`)

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

	paramsWithSourceHints := attachSamplePdfHintsFromDesignSpec(params, specData)

	if sampleInputErr := h.validateSamplePdfInputIfProvided(paramsWithSourceHints); sampleInputErr != nil {
		return map[string]any{"success": false, "errorCode": "SAMPLE_PDF_REQUIRED", "message": sampleInputErr.Error()}
	}

	sampleAnalysis := h.analyzeSamplePdf(paramsWithSourceHints)
	strictLayout := shouldEnforceStrictReportLayout(params, specData)
	if dynamicSpecOk && requiresSamplePdfForStrictOverlay(specData, strictLayout) {
		if _, _, sampleErr := h.resolveSamplePdfInput(paramsWithSourceHints); sampleErr != nil {
			return map[string]any{
				"success":   false,
				"errorCode": "SAMPLE_PDF_REQUIRED",
				"message":   "strict overlay layout requires sample PDF input (samplePdfPath/samplePdfDataUrl/samplePdfBase64)",
			}
		}
	}
	if dynamicSpecOk && !strictLayout {
		specData = fitDynamicDesignSpecFromSample(specData, sampleAnalysis, params)
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
	var outputAbs string
	renderMode := ""
	var autoTuneReport map[string]any
	if previewMode {
		relPath = fmt.Sprintf("app_images/%s/%s", appID, outputName)
		var renderErr error
		if dynamicSpecOk {
			pdfBytes, renderMode, renderErr = h.renderDynamicDesignSpecWithSampleOverlayFallback(specData, dataMap, paramsWithSourceHints)
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

		outputAbs = filepath.Join(publicDir, outputName)
		if dynamicSpecOk {
			bytesOut, modeOut, err := h.renderDynamicDesignSpecWithSampleOverlayFallback(specData, dataMap, paramsWithSourceHints)
			renderMode = modeOut
			if err != nil {
				return map[string]any{"success": false, "errorCode": "PDF_RENDER_FAILED", "message": err.Error()}
			}
			if writeErr := os.WriteFile(outputAbs, bytesOut, 0o644); writeErr != nil {
				return map[string]any{"success": false, "errorCode": "PDF_RENDER_FAILED", "message": writeErr.Error()}
			}
			pdfBytes = bytesOut
		} else if err := renderReportTemplatePDF(outputAbs, spec, dataMap); err != nil {
			return map[string]any{"success": false, "errorCode": "PDF_RENDER_FAILED", "message": err.Error()}
		}
		relPath = fmt.Sprintf("app_images/%s/%s", appID, outputName)
		if len(pdfBytes) == 0 {
			if fileBytes, readErr := os.ReadFile(outputAbs); readErr == nil {
				pdfBytes = fileBytes
			}
		}
	} else {
		var renderErr error
		if dynamicSpecOk {
			pdfBytes, renderMode, renderErr = h.renderDynamicDesignSpecWithSampleOverlayFallback(specData, dataMap, paramsWithSourceHints)
		} else {
			pdfBytes, renderErr = renderReportTemplatePDFToBytes(spec, dataMap)
		}
		if renderErr != nil {
			return map[string]any{"success": false, "errorCode": "PDF_RENDER_FAILED", "message": renderErr.Error()}
		}
	}

	if dynamicSpecOk && sampleAnalysis != nil && !strictLayout && paramBool(params, "autoTuneFromSample", true) && len(pdfBytes) > 0 {
		tunedSpec, tunedBytes, tunedMode, tuneReport, tuneErr := h.autoTuneRenderedTemplateWithSample(specData, dataMap, pdfBytes, renderMode, sampleAnalysis, params)
		if tuneErr == nil {
			specData = tunedSpec
			if len(tunedBytes) > 0 {
				pdfBytes = tunedBytes
			}
			if strings.TrimSpace(tunedMode) != "" {
				renderMode = tunedMode
			}
			autoTuneReport = tuneReport
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
	if sampleAnalysis != nil {
		result["samplePdfAnalysis"] = sampleAnalysis
	}
	if previewMode && len(pdfBytes) > 0 && paramBool(params, "autoCompareFromSample", true) {
		if sampleBytes, sampleSrc, sampleErr := h.resolveSamplePdfInput(paramsWithSourceHints); sampleErr == nil && len(sampleBytes) > 0 {
			sampleLines, sampleMeta, sampleParseErr := h.extractPdfLineBoxesFromBytes(sampleBytes, "sample")
			renderedLines, renderedMeta, renderedParseErr := h.extractPdfLineBoxesFromBytes(pdfBytes, "rendered")
			if sampleParseErr == nil && renderedParseErr == nil {
				cmp := comparePdfLineLayouts(sampleLines, renderedLines)
				qualityGate := "needs_tuning"
				if cmp.CoveragePercent >= 80 && cmp.DriftP95 <= 6 {
					qualityGate = "pass"
				}
				result["layoutCompare"] = map[string]any{
					"sampleSource":        sampleSrc,
					"sampleMeta":          sampleMeta,
					"renderedMeta":        renderedMeta,
					"textCoveragePercent": cmp.CoveragePercent,
					"matchedLines":        cmp.Matched,
					"sampleLineCount":     cmp.SampleCount,
					"renderedLineCount":   cmp.RenderedCount,
					"positionDriftMm": map[string]any{
						"avg": cmp.DriftAvg,
						"p95": cmp.DriftP95,
						"max": cmp.DriftMax,
					},
					"missingSampleLines":    cmp.Missing,
					"unexpectedRenderLines": cmp.Unexpected,
					"qualityGate":           qualityGate,
				}
				if qualityGate != "pass" {
					result["previewWarning"] = "layout_compare_needs_tuning"
				}
			} else {
				result["layoutCompareError"] = firstNonEmptyString(errorString(sampleParseErr), errorString(renderedParseErr))
			}
		}
	}
	if autoTuneReport != nil {
		result["autoTuneReport"] = autoTuneReport
	}
	if previewMode {
		if dynamicSpecOk {
			result["designPlan"] = h.buildDynamicDesignPlan(specData, dataMap, params, sampleAnalysis)
		} else {
			result["designPlan"] = h.buildDesignPlan(spec, dataMap, params, sampleAnalysis)
		}
	}
	if dynamicSpecOk {
		result["designSpec"] = specData
		if strings.TrimSpace(renderMode) != "" {
			result["renderMode"] = renderMode
		}
		if strictLayout {
			result["strictLayout"] = true
		}
	}
	if paramBool(params, "autoGenerateTrigger", false) || paramBool(params, "includeTriggerBundle", false) {
		triggerKey := strings.TrimSpace(paramStr(params, "triggerKey"))
		result["triggerBundle"] = buildReportTemplateTriggerBundle(specData, dataMap, triggerKey, sampleAnalysis, params)
	}
	if len(pdfBytes) > 0 {
		result["pdfSize"] = len(pdfBytes)
	}
	if saveToDisk && outputAbs != "" && len(pdfBytes) > 0 {
		_ = os.WriteFile(outputAbs, pdfBytes, 0o644)
	}
	if previewMode || paramBool(params, "returnBase64", false) {
		result["pdfBase64"] = base64.StdEncoding.EncodeToString(pdfBytes)
		result["pdfMimeType"] = "application/pdf"
	}
	return result
}

func requiresSamplePdfForStrictOverlay(spec map[string]any, strictLayout bool) bool {
	if !strictLayout {
		return false
	}
	return shouldPreferOverlayLockedRender(spec)
}

func errorString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func (h *AiHandler) renderDynamicDesignSpecWithSampleOverlayFallback(spec map[string]any, data map[string]any, params map[string]any) ([]byte, string, error) {
	if bytesOut, ok, err := h.renderDynamicDesignSpecOverlayOnSamplePDF(spec, data, params); ok {
		if err != nil {
			return nil, "overlay_sample_failed", err
		}
		return bytesOut, "overlay_sample_pdf", nil
	}
	return renderDynamicDesignSpecWithFallbackToBytes(spec, data)
}

func (h *AiHandler) renderDynamicDesignSpecOverlayOnSamplePDF(spec map[string]any, data map[string]any, params map[string]any) ([]byte, bool, error) {
	if !shouldPreferOverlayLockedRender(spec) {
		return nil, false, nil
	}
	items := parseReportCanvasTextItems(spec)
	if len(items) == 0 {
		return nil, false, nil
	}
	sampleBytes, _, err := h.resolveSamplePdfInput(params)
	if err != nil || len(sampleBytes) == 0 {
		return nil, false, nil
	}
	overlayStaticText := paramBool(params, "overlayStaticTextOnSample", false)

	coord := buildReportCoordinateMeta(spec, items)
	overlays := make([]pdfOverlayTextItem, 0, len(items))
	for _, item := range items {
		if !overlayStaticText && !shouldOverlayDynamicItemOnSample(item.Text) {
			continue
		}
		rendered := renderTemplateText(item.Text, data)
		if strings.TrimSpace(rendered) == "" {
			continue
		}
		xPt, yPt := coord.toPDFPoints(item.X, item.Y)
		fontSize := int(math.Round(item.FontSize))
		if fontSize <= 0 {
			fontSize = 10
		}
		overlays = append(overlays, pdfOverlayTextItem{
			Page:     maxInt(1, item.Page),
			Text:     rendered,
			X:        xPt,
			Y:        yPt,
			FontSize: maxInt(6, fontSize),
			FontName: strings.TrimSpace(item.FontName),
			Color:    strings.TrimSpace(item.Color),
			Opacity:  1,
		})
	}
	if len(overlays) == 0 {
		// No dynamic token overlays: keep original sample PDF as-is for maximum visual fidelity.
		return sampleBytes, true, nil
	}

	resultBytes, applyErr := applyPdfTextOverlays(sampleBytes, overlays)
	if applyErr != nil {
		return nil, true, applyErr
	}
	return resultBytes, true, nil
}

func shouldOverlayDynamicItemOnSample(templateText string) bool {
	t := strings.TrimSpace(templateText)
	if t == "" {
		return false
	}
	return reportTemplateTokenPattern.MatchString(t)
}

func applyPdfTextOverlays(inputPDF []byte, items []pdfOverlayTextItem) ([]byte, error) {
	if len(inputPDF) == 0 {
		return nil, fmt.Errorf("input pdf is empty")
	}
	if len(items) == 0 {
		return inputPDF, nil
	}

	tmpRoot := filepath.Join(os.TempDir(), "report_pdf_overlay_apply")
	if err := os.MkdirAll(tmpRoot, 0o755); err != nil {
		return nil, err
	}
	workDir, err := os.MkdirTemp(tmpRoot, "overlay-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(workDir)

	inputPath := filepath.Join(workDir, "input.pdf")
	if err := os.WriteFile(inputPath, inputPDF, 0o644); err != nil {
		return nil, err
	}
	current := inputPath
	for idx, it := range items {
		wm, wmErr := buildOverlayWatermark(it)
		if wmErr != nil {
			return nil, wmErr
		}
		next := filepath.Join(workDir, fmt.Sprintf("overlay_%04d.pdf", idx+1))
		pages := []string{strconv.Itoa(maxInt(1, it.Page))}
		if err := api.AddWatermarksFile(current, next, pages, wm, nil); err != nil {
			return nil, err
		}
		current = next
	}
	return os.ReadFile(current)
}

func attachSamplePdfHintsFromDesignSpec(params map[string]any, specData map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range params {
		out[k] = v
	}
	if specData == nil {
		return out
	}
	hasExplicit := strings.TrimSpace(fmt.Sprint(out["samplePdfPath"])) != "" || strings.TrimSpace(fmt.Sprint(out["pdfPath"])) != "" || strings.TrimSpace(fmt.Sprint(out["samplePdfDataUrl"])) != "" || strings.TrimSpace(fmt.Sprint(out["pdfDataUrl"])) != ""
	if hasExplicit {
		return out
	}

	locks := toMapAny(specData["layoutLocks"])
	sourcePath := strings.TrimSpace(fmt.Sprint(locks["sourcePdfPath"]))
	sourceDataURL := strings.TrimSpace(fmt.Sprint(locks["sourcePdfDataUrl"]))
	if sourcePath != "" {
		out["samplePdfPath"] = sourcePath
	}
	if sourceDataURL != "" {
		out["samplePdfDataUrl"] = sourceDataURL
	}
	return out
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

func (h *AiHandler) handleAiLocalRenderTemplateTrigger(params map[string]any) map[string]any {
	dynamicSpec, dynamicSpecOk, dynamicSpecErr := h.parseDynamicDesignSpec(params)
	if dynamicSpecErr != nil {
		return map[string]any{"success": false, "errorCode": "DESIGN_SPEC_INVALID", "message": dynamicSpecErr.Error()}
	}

	templatePath := strings.TrimSpace(paramStr(params, "templatePath"))
	if templatePath == "" && !dynamicSpecOk {
		return map[string]any{"success": false, "errorCode": "TEMPLATE_PATH_REQUIRED", "message": "missing templatePath or reportDesignSpec"}
	}

	var specData map[string]any
	if dynamicSpecOk {
		specData = dynamicSpec
	} else {
		spec, specErr := h.loadReportTemplateSpec(templatePath)
		if specErr != nil {
			inlineSpec, inlineOk, inlineErr := h.parseInlineTemplateSpec(params)
			if inlineOk && inlineErr == nil {
				spec = inlineSpec
			} else {
				spec = defaultReportTemplateSpec(templatePath)
			}
		}
		specData = map[string]any{
			"title":   spec.Title,
			"header":  spec.Header,
			"notes":   spec.Notes,
			"columns": spec.Columns,
		}
	}

	if len(specData) == 0 {
		return map[string]any{"success": false, "errorCode": "TEMPLATE_SPEC_EMPTY", "message": "empty template spec"}
	}

	dataMap := buildRenderData(params)
	triggerKey := strings.TrimSpace(paramStr(params, "triggerKey"))
	sampleAnalysis := h.analyzeSamplePdf(params)
	fittedSpec := fitDynamicDesignSpecFromSample(specData, sampleAnalysis, params)
	bundle := buildReportTemplateTriggerBundle(fittedSpec, dataMap, triggerKey, sampleAnalysis, params)

	return map[string]any{
		"success":          true,
		"message":          "template_trigger_generated",
		"templatePath":     templatePath,
		"fittedDesignSpec": fittedSpec,
		"triggerBundle":    bundle,
	}
}

func (h *AiHandler) handleAiLocalPdfToSystemTemplate(params map[string]any) map[string]any {
	if err := h.validateSamplePdfInputIfProvided(params); err != nil {
		return map[string]any{"success": false, "errorCode": "SAMPLE_PDF_REQUIRED", "message": err.Error()}
	}

	sampleBytes, sampleSrc, sampleErr := h.resolveSamplePdfInput(params)
	if sampleErr != nil || len(sampleBytes) == 0 {
		return map[string]any{"success": false, "errorCode": "SAMPLE_PDF_REQUIRED", "message": "missing sample pdf input"}
	}

	sampleAnalysis := h.analyzeSamplePdf(params)
	baseSpec, ok, parseErr := h.parseDynamicDesignSpec(params)
	if parseErr != nil {
		return map[string]any{"success": false, "errorCode": "DESIGN_SPEC_INVALID", "message": parseErr.Error()}
	}
	if !ok || len(baseSpec) == 0 {
		baseSpec = map[string]any{}
	}

	inferredSpec := inferQuotationSpecFromSampleText(baseSpec, sampleAnalysis)
	fittedSpec := fitDynamicDesignSpecFromSample(inferredSpec, sampleAnalysis, params)

	dataMap := buildRenderData(params)
	triggerKey := strings.TrimSpace(paramStr(params, "triggerKey"))
	bundle := buildReportTemplateTriggerBundle(fittedSpec, dataMap, triggerKey, sampleAnalysis, params)

	tokenSet := map[string]struct{}{}
	collectReportTemplateTokens(fittedSpec, tokenSet)
	variableIDs := sortedReportTokens(tokenSet)

	systemTemplate := map[string]any{
		"version":         "csm.report-template.v1",
		"compiledAtUtc":   time.Now().UTC().Format(time.RFC3339),
		"sourceSamplePdf": sampleSrc,
		"layoutKind":      fmt.Sprint(fittedSpec["layoutKind"]),
		"renderArchetype": buildReportRenderArchetype(fittedSpec, sampleAnalysis),
		"title":           fittedSpec["title"],
		"company":         fittedSpec["company"],
		"quotation":       fittedSpec["quotation"],
		"table":           fittedSpec["table"],
		"notes":           fittedSpec["notes"],
		"paymentTerms":    fittedSpec["paymentTerms"],
		"style":           fittedSpec["style"],
		"logo":            fittedSpec["logo"],
		"layoutLocks":     fittedSpec["layoutLocks"],
		"variableIds":     variableIDs,
		"fidelityConstraints": map[string]any{
			"lockLayout":       true,
			"lockLogoPosition": true,
			"keepGroupedTable": isQuotationGroupedSpec(fittedSpec),
			"strictTokens":     true,
		},
		"dataContract": map[string]any{
			"requiredTopLevel":   []string{"client", "sales", "items", "quotation_no", "date", "valid_until"},
			"requiredItemFields": []string{"group_title", "name", "unit", "quantity", "unit_price"},
		},
	}

	logoReady := false
	if logoMap := toMapAny(systemTemplate["logo"]); len(logoMap) > 0 {
		logoReady = firstNonEmptyString(fmt.Sprint(logoMap["url"]), fmt.Sprint(logoMap["path"]), fmt.Sprint(logoMap["src"])) != ""
	}
	if !logoReady {
		if hints, ok := sampleAnalysis["imageHints"].([]any); ok && len(hints) > 0 {
			logoReady = true
		}
	}
	tableReady := false
	if tableMap := toMapAny(systemTemplate["table"]); len(tableMap) > 0 {
		headers, _ := tableMap["headers"].([]any)
		fields, _ := tableMap["fields"].([]any)
		tableReady = len(headers) > 0 && len(fields) > 0
	}
	triggerReady := false
	if triggerMap := toMapAny(bundle["trigger"]); len(triggerMap) > 0 {
		triggerReady = strings.TrimSpace(fmt.Sprint(triggerMap["report_db"])) != "" && strings.TrimSpace(fmt.Sprint(triggerMap["pdf_data"])) != ""
	}
	pdfForgeReady := false
	if portable := toMapAny(bundle["portableDocument"]); len(portable) > 0 {
		exportInfo := toMapAny(portable["exportInfo"])
		meta := toMapAny(portable["meta"])
		pdfForgeReady = strings.TrimSpace(fmt.Sprint(exportInfo["sourceApp"])) != "" && strings.TrimSpace(fmt.Sprint(exportInfo["exportedAt"])) != "" && strings.TrimSpace(fmt.Sprint(meta["language"])) != ""
	}
	qualityScore := 0
	for _, ok := range []bool{logoReady, tableReady, triggerReady, pdfForgeReady} {
		if ok {
			qualityScore += 25
		}
	}
	qualityGate := map[string]any{
		"status":        map[bool]string{true: "pass", false: "needs-review"}[qualityScore >= 75],
		"score":         qualityScore,
		"logoReady":     logoReady,
		"tableReady":    tableReady,
		"triggerReady":  triggerReady,
		"pdfForgeReady": pdfForgeReady,
	}

	checklist := []string{
		"Có samplePdfAnalysis, palette, layoutLocks và imageHints để khớp mẫu",
		"Có fittedDesignSpec với layoutKind phù hợp và khóa table/logo",
		"Có triggerBundle.report_db và triggerBundle.pdf_data để chuẩn hóa dữ liệu runtime",
		"Có variableIds để map token đồng nhất giữa spec, trigger và render",
	}

	knownLimits := []string{
		"Khớp pixel tuyệt đối phụ thuộc font nội bộ và sai khác engine PDF",
		"Các vector/path phức tạp từ PDF gốc chưa được ánh xạ thành node hình học chi tiết",
	}

	return map[string]any{
		"success":           true,
		"message":           "pdf_compiled_to_system_template",
		"sampleSource":      sampleSrc,
		"samplePdfAnalysis": sampleAnalysis,
		"systemTemplate":    systemTemplate,
		"fittedDesignSpec":  fittedSpec,
		"triggerBundle":     bundle,
		"qualityGate":       qualityGate,
		"accuracyChecklist": checklist,
		"knownLimits":       knownLimits,
		"nextStepHint":      "Dùng systemTemplate + triggerBundle để preview hoặc render chính thức bằng /ai-local/report/render-template",
	}
}

func buildReportTemplateTriggerBundle(spec map[string]any, data map[string]any, triggerKey string, sampleAnalysis map[string]any, params map[string]any) map[string]any {
	if triggerKey == "" {
		triggerKey = "pdf_dynamic_auto"
	}
	tokenSet := map[string]struct{}{}
	collectReportTemplateTokens(spec, tokenSet)
	variableIDs := ensurePdfForgeVariableIDs(sortedReportTokens(tokenSet), spec, sampleAnalysis)

	injectables := buildPdfForgeInjectables(variableIDs, data, spec, sampleAnalysis)
	portable := buildPdfForgePortableDocument(spec, variableIDs, sampleAnalysis)
	designKit := buildReportDesignKit(spec, variableIDs, sampleAnalysis, params)
	return map[string]any{
		"triggerKey":         triggerKey,
		"variableIds":        variableIDs,
		"injectables":        injectables,
		"portableDocument":   portable,
		"fittedDesignSpec":   spec,
		"designKit":          designKit,
		"sampleDataTemplate": buildTriggerSamplePayload(variableIDs, data, spec, sampleAnalysis),
		"trigger": map[string]any{
			"report_db": buildAutoReportDBTriggerBody(),
			"pdf_data":  buildAutoPdfDataTriggerBody(spec, variableIDs),
		},
	}
}

func buildPdfForgePortableDocument(spec map[string]any, variableIDs []string, sampleAnalysis map[string]any) map[string]any {
	title := strings.TrimSpace(fmt.Sprint(spec["title"]))
	if title == "" || title == "<nil>" {
		title = "BÁO CÁO"
	}
	logoVarID, _, logoAlt := resolvePdfForgeLogoVariable(spec, sampleAnalysis)
	header := map[string]any{
		"enabled": false,
	}
	if logoVarID != "" {
		header = map[string]any{
			"enabled":              true,
			"layout":               "image-left",
			"imageInjectableId":    logoVarID,
			"imageInjectableLabel": logoAlt,
			"imageAlt":             logoAlt,
			"imageWidth":           96,
			"imageHeight":          32,
			"content": map[string]any{
				"type": "doc",
				"content": []any{
					map[string]any{
						"type": "paragraph",
						"content": []any{
							map[string]any{"type": "text", "text": title},
						},
					},
				},
			},
		}
	}

	return map[string]any{
		"version": "2.2.0",
		"meta": map[string]any{
			"title":       title,
			"description": "Generated by AI local from report design spec",
			"language":    "en",
		},
		"pageConfig": map[string]any{
			"formatId": "A4",
			"width":    794,
			"height":   1123,
			"margins": map[string]any{
				"top":    48,
				"right":  48,
				"bottom": 48,
				"left":   48,
			},
		},
		"variableIds": variableIDs,
		"content":     buildPortableDocContent(variableIDs, title),
		"header":      header,
		"exportInfo": map[string]any{
			"sourceApp":  "csm-ai-local",
			"exportedAt": time.Now().UTC().Format(time.RFC3339),
		},
	}
}

func buildPortableDocContent(variableIDs []string, title string) map[string]any {
	nodes := make([]any, 0, len(variableIDs)+1)
	nodes = append(nodes, map[string]any{
		"type": "paragraph",
		"content": []any{
			map[string]any{"type": "text", "text": title},
		},
	})
	for _, id := range variableIDs {
		if id == "items" || id == "rows" || id == "list" {
			nodes = append(nodes, map[string]any{
				"type":  "tableInjector",
				"attrs": map[string]any{"variableId": id},
			})
			continue
		}
		nodes = append(nodes, map[string]any{
			"type": "paragraph",
			"content": []any{
				map[string]any{"type": "text", "text": id + ": "},
				map[string]any{"type": "injector", "attrs": map[string]any{"variableId": id}},
			},
		})
	}
	return map[string]any{"type": "doc", "content": nodes}
}

func buildPdfForgeInjectables(variableIDs []string, data map[string]any, spec map[string]any, sampleAnalysis map[string]any) []map[string]any {
	logoVarID, logoValue, logoAlt := resolvePdfForgeLogoVariable(spec, sampleAnalysis)
	out := make([]map[string]any, 0, len(variableIDs))
	for _, id := range variableIDs {
		path := strings.TrimSpace(id)
		typeName := inferInjectableType(path, data)
		sampleValue := resolvePath(data, path)
		if sampleValue == nil && path == logoVarID && logoValue != nil {
			sampleValue = logoValue
			typeName = "IMAGE"
		}
		out = append(out, map[string]any{
			"id":         path,
			"key":        path,
			"code":       path,
			"label":      map[string]any{"en": firstNonEmptyString(logoAlt, path), "es": firstNonEmptyString(logoAlt, path)},
			"dataType":   typeName,
			"sourceType": "EXTERNAL",
			"isGlobal":   true,
			"sourcePath": path,
			"sample":     sampleValue,
		})
	}
	return out
}

func buildTriggerSamplePayload(variableIDs []string, data map[string]any, spec map[string]any, sampleAnalysis map[string]any) map[string]any {
	payload := map[string]any{}
	logoVarID, logoValue, _ := resolvePdfForgeLogoVariable(spec, sampleAnalysis)
	for _, id := range variableIDs {
		if value := resolvePath(data, id); value != nil {
			payload[id] = value
		} else if id == logoVarID && logoValue != nil {
			payload[id] = logoValue
		} else {
			payload[id] = ""
		}
	}
	rows := renderRowsFromData(data)
	payload["items"] = rows
	payload["rows"] = rows
	payload["list"] = rows
	return payload
}

func inferInjectableType(token string, data map[string]any) string {
	v := resolvePath(data, token)
	return classifyInjectableValue(v)
}

func classifyInjectableValue(v any) string {
	if v == nil {
		return "TEXT"
	}
	switch val := v.(type) {
	case bool:
		return "BOOLEAN"
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return "NUMBER"
	case time.Time:
		return "DATE"
	case []any, []map[string]any, []string, []float64, []int:
		return "LIST"
	case map[string]any:
		if _, ok := val["url"]; ok {
			return "IMAGE"
		}
		if _, ok := val["path"]; ok {
			return "IMAGE"
		}
		return "TABLE"
	case string:
		trimmed := strings.TrimSpace(val)
		if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
			if strings.HasSuffix(strings.ToLower(trimmed), ".png") || strings.HasSuffix(strings.ToLower(trimmed), ".jpg") || strings.HasSuffix(strings.ToLower(trimmed), ".jpeg") || strings.HasSuffix(strings.ToLower(trimmed), ".webp") {
				return "IMAGE"
			}
		}
	}
	return "TEXT"
}

func ensurePdfForgeVariableIDs(base []string, spec map[string]any, sampleAnalysis map[string]any) []string {
	set := map[string]struct{}{}
	out := make([]string, 0, len(base)+4)
	for _, id := range base {
		k := strings.TrimSpace(id)
		if k == "" {
			continue
		}
		if _, exists := set[k]; exists {
			continue
		}
		set[k] = struct{}{}
		out = append(out, k)
	}
	for _, required := range []string{"items", "rows", "list"} {
		if _, exists := set[required]; exists {
			continue
		}
		set[required] = struct{}{}
		out = append(out, required)
	}
	if logoVarID, _, _ := resolvePdfForgeLogoVariable(spec, sampleAnalysis); logoVarID != "" {
		if _, exists := set[logoVarID]; !exists {
			set[logoVarID] = struct{}{}
			out = append(out, logoVarID)
		}
	}
	sort.Strings(out)
	return out
}

func resolvePdfForgeLogoVariable(spec map[string]any, sampleAnalysis map[string]any) (string, any, string) {
	logo := toMapAny(spec["logo"])
	logoID := strings.TrimSpace(fmt.Sprint(logo["injectableId"]))
	if logoID == "" {
		logoID = strings.TrimSpace(fmt.Sprint(logo["token"]))
	}
	logoURL := firstNonEmptyString(
		fmt.Sprint(logo["url"]),
		fmt.Sprint(logo["path"]),
		fmt.Sprint(logo["src"]),
	)
	logoAlt := firstNonEmptyString(
		fmt.Sprint(logo["name"]),
		fmt.Sprint(logo["label"]),
		"company_logo",
	)
	if logoURL == "" {
		if hints, ok := sampleAnalysis["imageHints"].([]any); ok && len(hints) > 0 {
			first := toMapAny(hints[0])
			logoURL = firstNonEmptyString(fmt.Sprint(first["url"]), fmt.Sprint(first["path"]), fmt.Sprint(first["fileName"]))
			logoAlt = firstNonEmptyString(fmt.Sprint(first["fileName"]), logoAlt)
		}
	}
	if logoID == "" && logoURL != "" {
		logoID = "company_logo"
	}
	if logoID == "" {
		return "", nil, logoAlt
	}
	if logoURL == "" {
		return logoID, map[string]any{}, logoAlt
	}
	return logoID, map[string]any{"url": logoURL, "alt": logoAlt}, logoAlt
}

func buildAutoReportDBTriggerBody() string {
	return "(seft, db) => { if (Array.isArray(db)) return db; if (db && Array.isArray(db.rows)) return db.rows; return []; }"
}

func buildAutoPdfDataTriggerBody(spec map[string]any, variableIDs []string) string {
	if isQuotationGroupedSpec(spec) {
		return buildAutoQuotationPdfDataTriggerBody(variableIDs)
	}

	var sb strings.Builder
	sb.WriteString("(seft, db, runtime) => {\n")
	sb.WriteString("  const rows = Array.isArray(runtime && runtime.items) ? runtime.items : (Array.isArray(runtime && runtime.rows) ? runtime.rows : (Array.isArray(runtime && runtime.list) ? runtime.list : (Array.isArray(db) ? db : [])));\n")
	sb.WriteString("  const baseRow = rows.length > 0 ? rows[0] : {};\n")
	sb.WriteString("  const pickPath = (obj, path) => {\n")
	sb.WriteString("    if (!obj || !path) return undefined;\n")
	sb.WriteString("    const parts = String(path).split('.');\n")
	sb.WriteString("    let cur = obj;\n")
	sb.WriteString("    for (const part of parts) {\n")
	sb.WriteString("      if (cur == null || typeof cur !== 'object' || !(part in cur)) return undefined;\n")
	sb.WriteString("      cur = cur[part];\n")
	sb.WriteString("    }\n")
	sb.WriteString("    return cur;\n")
	sb.WriteString("  };\n")
	sb.WriteString("  const firstNonEmpty = (...vals) => {\n")
	sb.WriteString("    for (const v of vals) {\n")
	sb.WriteString("      if (v === 0 || v === false) return v;\n")
	sb.WriteString("      if (v !== undefined && v !== null && String(v).trim() !== '') return v;\n")
	sb.WriteString("    }\n")
	sb.WriteString("    return '';\n")
	sb.WriteString("  };\n")
	sb.WriteString("  const payload = {};\n")
	for _, token := range variableIDs {
		quoted := strconv.Quote(token)
		sb.WriteString("  payload[")
		sb.WriteString(quoted)
		sb.WriteString("] = firstNonEmpty(pickPath(runtime, ")
		sb.WriteString(quoted)
		sb.WriteString("), pickPath(baseRow, ")
		sb.WriteString(quoted)
		sb.WriteString("));\n")
	}
	sb.WriteString("  payload.items = rows.map((row, idx) => ({ __index: idx + 1, ...row }));\n")
	sb.WriteString("  payload.rows = payload.items;\n")
	sb.WriteString("  payload.list = payload.items;\n")
	sb.WriteString("  return payload;\n")
	sb.WriteString("}")
	return sb.String()
}

func buildAutoQuotationPdfDataTriggerBody(variableIDs []string) string {
	var sb strings.Builder
	sb.WriteString("(seft, db, runtime) => {\n")
	sb.WriteString("  const rows = Array.isArray(runtime && runtime.items) ? runtime.items : (Array.isArray(runtime && runtime.rows) ? runtime.rows : (Array.isArray(runtime && runtime.list) ? runtime.list : (Array.isArray(db) ? db : [])));\n")
	sb.WriteString("  const first = rows.length > 0 ? rows[0] : {};\n")
	sb.WriteString("  const pickPath = (obj, path) => {\n")
	sb.WriteString("    if (!obj || !path) return undefined;\n")
	sb.WriteString("    const parts = String(path).split('.');\n")
	sb.WriteString("    let cur = obj;\n")
	sb.WriteString("    for (const part of parts) {\n")
	sb.WriteString("      if (cur == null || typeof cur !== 'object' || !(part in cur)) return undefined;\n")
	sb.WriteString("      cur = cur[part];\n")
	sb.WriteString("    }\n")
	sb.WriteString("    return cur;\n")
	sb.WriteString("  };\n")
	sb.WriteString("  const firstNonEmpty = (...vals) => {\n")
	sb.WriteString("    for (const v of vals) {\n")
	sb.WriteString("      if (v === 0 || v === false) return v;\n")
	sb.WriteString("      if (v !== undefined && v !== null && String(v).trim() !== '') return v;\n")
	sb.WriteString("    }\n")
	sb.WriteString("    return '';\n")
	sb.WriteString("  };\n")
	sb.WriteString("  const payload = {};\n")
	for _, token := range variableIDs {
		quoted := strconv.Quote(token)
		sb.WriteString("  payload[")
		sb.WriteString(quoted)
		sb.WriteString("] = firstNonEmpty(pickPath(runtime, ")
		sb.WriteString(quoted)
		sb.WriteString("), pickPath(first, ")
		sb.WriteString(quoted)
		sb.WriteString("));\n")
	}
	sb.WriteString("  payload.client = {\n")
	sb.WriteString("    company: firstNonEmpty(pickPath(runtime, 'client.company'), pickPath(runtime, 'customerName'), pickPath(first, 'client.company'), pickPath(first, 'client_name')),\n")
	sb.WriteString("    address: firstNonEmpty(pickPath(runtime, 'client.address'), pickPath(first, 'client.address')),\n")
	sb.WriteString("    contact: firstNonEmpty(pickPath(runtime, 'client.contact'), pickPath(first, 'client.contact'))\n")
	sb.WriteString("  };\n")
	sb.WriteString("  payload.sales = {\n")
	sb.WriteString("    name: firstNonEmpty(pickPath(runtime, 'sales.name'), pickPath(runtime, 'nvkd'), pickPath(first, 'sales.name'), pickPath(first, 'sales_name')),\n")
	sb.WriteString("    phone: firstNonEmpty(pickPath(runtime, 'sales.phone'), pickPath(first, 'sales.phone'))\n")
	sb.WriteString("  };\n")
	sb.WriteString("  payload.quotation_no = firstNonEmpty(pickPath(runtime, 'quotation_no'), pickPath(runtime, 'reportNo'), pickPath(first, 'quotation_no'));\n")
	sb.WriteString("  payload.date = firstNonEmpty(pickPath(runtime, 'date'), pickPath(runtime, 'reportDate'), pickPath(first, 'date'));\n")
	sb.WriteString("  payload.valid_until = firstNonEmpty(pickPath(runtime, 'valid_until'), pickPath(first, 'valid_until'));\n")
	sb.WriteString("  payload.items = rows.map((row, idx) => {\n")
	sb.WriteString("    const qty = Number(firstNonEmpty(row.quantity, row.qty, row.so_tam, 0)) || 0;\n")
	sb.WriteString("    const width = Number(firstNonEmpty(row.width, row.chieu_rong, 0)) || 0;\n")
	sb.WriteString("    const length = Number(firstNonEmpty(row.length, row.chieu_dai, 0)) || 0;\n")
	sb.WriteString("    const unitPrice = Number(firstNonEmpty(row.unit_price, row.unitPrice, row.don_gia, 0)) || 0;\n")
	sb.WriteString("    const weight = Number(firstNonEmpty(row.weight, row.khoi_luong, width * length * qty, 0)) || 0;\n")
	sb.WriteString("    const amount = Number(firstNonEmpty(row.amount, row.thanh_tien, weight * unitPrice, 0)) || 0;\n")
	sb.WriteString("    return {\n")
	sb.WriteString("      __index: idx + 1,\n")
	sb.WriteString("      group_title: firstNonEmpty(row.group_title, row.groupTitle),\n")
	sb.WriteString("      group_desc: firstNonEmpty(row.group_desc, row.groupDesc),\n")
	sb.WriteString("      vat_rate: Number(firstNonEmpty(row.vat_rate, row.vatRate, 10)) || 10,\n")
	sb.WriteString("      name: firstNonEmpty(row.name, row.ten_san_pham),\n")
	sb.WriteString("      unit: firstNonEmpty(row.unit, row.don_vi, 'm2'),\n")
	sb.WriteString("      width,\n")
	sb.WriteString("      length,\n")
	sb.WriteString("      quantity: qty,\n")
	sb.WriteString("      weight,\n")
	sb.WriteString("      unit_price: unitPrice,\n")
	sb.WriteString("      amount\n")
	sb.WriteString("    };\n")
	sb.WriteString("  });\n")
	sb.WriteString("  payload.rows = payload.items;\n")
	sb.WriteString("  payload.list = payload.items;\n")
	sb.WriteString("  return payload;\n")
	sb.WriteString("}")
	return sb.String()
}

func collectReportTemplateTokens(raw any, out map[string]struct{}) {
	if out == nil || raw == nil {
		return
	}
	switch v := raw.(type) {
	case string:
		for _, m := range reportTemplateTokenPattern.FindAllStringSubmatch(v, -1) {
			if len(m) < 2 {
				continue
			}
			token := normalizeReportToken(m[1])
			if token == "" {
				continue
			}
			out[token] = struct{}{}
		}
	case []any:
		for _, item := range v {
			collectReportTemplateTokens(item, out)
		}
	case map[string]any:
		for _, item := range v {
			collectReportTemplateTokens(item, out)
		}
	}
}

func normalizeReportToken(token string) string {
	t := strings.TrimSpace(token)
	t = strings.TrimPrefix(t, "{")
	t = strings.TrimSuffix(t, "}")
	return strings.TrimSpace(t)
}

func sortedReportTokens(tokenSet map[string]struct{}) []string {
	out := make([]string, 0, len(tokenSet))
	for token := range tokenSet {
		out = append(out, token)
	}
	sort.Strings(out)
	return out
}

func (h *AiHandler) autoTuneRenderedTemplateWithSample(spec map[string]any, data map[string]any, renderedBytes []byte, renderMode string, sampleAnalysis map[string]any, params map[string]any) (map[string]any, []byte, string, map[string]any, error) {
	sampleBytes, _, sampleErr := h.resolveSamplePdfInput(params)
	if sampleErr != nil || len(sampleBytes) == 0 {
		return spec, renderedBytes, renderMode, nil, sampleErr
	}

	baseCmp, baseErr := h.compareSampleAndRenderedPDFBytes(sampleBytes, renderedBytes)
	if baseErr != nil {
		return spec, renderedBytes, renderMode, nil, baseErr
	}

	report := map[string]any{
		"enabled": true,
		"attempts": []any{
			map[string]any{"name": "base", "compare": baseCmp},
		},
		"best": baseCmp,
	}
	if score, ok := baseCmp["qualityGate"].(string); ok && score == "pass" {
		report["applied"] = false
		return spec, renderedBytes, renderMode, report, nil
	}

	tunedSpec := applyReportLayoutLocksFromSample(spec, sampleAnalysis)
	tunedBytes, tunedMode, tuneErr := renderDynamicDesignSpecWithFallbackToBytes(tunedSpec, data)
	if tuneErr != nil {
		report["applied"] = false
		report["error"] = tuneErr.Error()
		return spec, renderedBytes, renderMode, report, nil
	}
	tunedCmp, tunedCmpErr := h.compareSampleAndRenderedPDFBytes(sampleBytes, tunedBytes)
	if tunedCmpErr != nil {
		report["applied"] = false
		report["error"] = tunedCmpErr.Error()
		return spec, renderedBytes, renderMode, report, nil
	}
	report["attempts"] = append(report["attempts"].([]any), map[string]any{
		"name":    "layout_lock_refit",
		"compare": tunedCmp,
		"mode":    tunedMode,
	})

	baseScore := reportFitScore(baseCmp)
	tunedScore := reportFitScore(tunedCmp)
	if tunedScore >= baseScore {
		report["applied"] = true
		report["best"] = tunedCmp
		report["selectedAttempt"] = "layout_lock_refit"
		return tunedSpec, tunedBytes, tunedMode, report, nil
	}

	report["applied"] = false
	report["selectedAttempt"] = "base"
	return spec, renderedBytes, renderMode, report, nil
}

func reportFitScore(compare map[string]any) float64 {
	coverage := numberFromAny(compare["textCoveragePercent"])
	driftMap := toMapAny(compare["positionDriftMm"])
	p95 := numberFromAny(driftMap["p95"])
	return coverage - (p95 * 2)
}

func (h *AiHandler) compareSampleAndRenderedPDFBytes(sampleBytes, renderedBytes []byte) (map[string]any, error) {
	sampleLines, sampleMeta, err := h.extractPdfLineBoxesFromBytes(sampleBytes, "sample-tune")
	if err != nil {
		return nil, err
	}
	renderedLines, renderedMeta, err := h.extractPdfLineBoxesFromBytes(renderedBytes, "rendered-tune")
	if err != nil {
		return nil, err
	}
	cmp := comparePdfLineLayouts(sampleLines, renderedLines)
	result := map[string]any{
		"textCoveragePercent": cmp.CoveragePercent,
		"matchedLines":        cmp.Matched,
		"sampleLineCount":     cmp.SampleCount,
		"renderedLineCount":   cmp.RenderedCount,
		"positionDriftMm": map[string]any{
			"avg": cmp.DriftAvg,
			"p95": cmp.DriftP95,
			"max": cmp.DriftMax,
		},
		"missingSampleLines":    cmp.Missing,
		"unexpectedRenderLines": cmp.Unexpected,
		"sampleMeta":            sampleMeta,
		"renderedMeta":          renderedMeta,
	}
	if cmp.CoveragePercent >= 80 && cmp.DriftP95 <= 6 {
		result["qualityGate"] = "pass"
	} else {
		result["qualityGate"] = "needs_tuning"
	}
	return result, nil
}

func applyReportLayoutLocksFromSample(spec map[string]any, sampleAnalysis map[string]any) map[string]any {
	fitted := deepCloneReportMap(spec)
	locks := toMapAny(sampleAnalysis["layoutLocks"])
	if len(locks) == 0 {
		lineBoxes := make([]pdfExtractLineBox, 0)
		if raw, ok := sampleAnalysis["lineBoxes"].([]any); ok {
			for _, item := range raw {
				m := toMapAny(item)
				lineBoxes = append(lineBoxes, pdfExtractLineBox{
					Text: fmt.Sprint(m["text"]),
					X:    numberFromAny(m["x"]),
					Y:    numberFromAny(m["y"]),
					Page: int(numberFromAny(m["page"])),
				})
			}
		}
		pageWidth := numberFromAny(sampleAnalysis["pageWidth"])
		if pageWidth <= 0 {
			if pages, ok := sampleAnalysis["pages"].([]any); ok && len(pages) > 0 {
				pageWidth = numberFromAny(toMapAny(pages[0])["width"])
			}
		}
		locks = deriveReportLayoutLocks(lineBoxes, pageWidth)
	}

	if tableLock := toMapAny(locks["tableBox"]); len(tableLock) > 0 {
		table := deepCloneReportMap(toMapAny(fitted["table"]))
		if len(table) > 0 {
			table["anchor"] = tableLock
			table["lockToSample"] = true
			fitted["table"] = table
		}
	}
	if logoLock := toMapAny(locks["logoBox"]); len(logoLock) > 0 {
		logo := deepCloneReportMap(toMapAny(fitted["logo"]))
		logo["box"] = logoLock
		logo["lockToSample"] = true
		fitted["logo"] = logo
	}

	fitted["layoutLocks"] = locks
	return fitted
}

func deriveReportLayoutLocks(lineBoxes []pdfExtractLineBox, pageWidth float64) map[string]any {
	if len(lineBoxes) == 0 {
		return map[string]any{}
	}
	if pageWidth <= 0 {
		pageWidth = 595
	}

	tableHeaderY := -1.0
	for _, box := range lineBoxes {
		if box.Page != 1 {
			continue
		}
		text := strings.ToLower(strings.TrimSpace(box.Text))
		if text == "" {
			continue
		}
		if strings.Contains(text, "stt") || strings.Contains(text, "đơn giá") || strings.Contains(text, "thành tiền") || strings.Contains(text, "so luong") || strings.Contains(text, "số lượng") {
			tableHeaderY = box.Y
			break
		}
	}

	locks := map[string]any{}
	if tableHeaderY > 0 {
		locks["tableBox"] = map[string]any{
			"x":      10.0,
			"y":      (tableHeaderY * 25.4 / 72.0) - 2,
			"width":  (pageWidth * 25.4 / 72.0) - 20,
			"height": 110.0,
			"page":   1,
			"unit":   "mm",
		}
	}
	locks["logoBox"] = map[string]any{
		"x": 10.0, "y": 8.0, "width": 28.0, "height": 14.0, "page": 1, "unit": "mm",
	}
	return locks
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
		if !isAllowedPdfSourcePath(pdfPath) {
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

func (h *AiHandler) buildDesignPlan(spec *reportTemplateSpec, data map[string]any, params map[string]any, sampleAnalysis map[string]any) map[string]any {
	plan := map[string]any{
		"templateName":            spec.Name,
		"recommendedTitle":        renderTemplateText(spec.Title, data),
		"recommendedHeaderFields": []string{"reportNo", "reportDate", "clientName"},
		"recommendedNotes":        spec.Notes,
		"recommendedColumns":      spec.Columns,
		"previewHint":             "Dùng mẫu PDF đã nạp để kiểm tra bố cục, tiêu đề và các trường dữ liệu trước khi xuất chính thức",
	}
	if sampleAnalysis == nil {
		sampleAnalysis = h.analyzeSamplePdf(params)
	}
	if sampleAnalysis != nil {
		plan["samplePdfAnalysis"] = sampleAnalysis
		if orderedLines, ok := sampleAnalysis["orderedLines"].([]string); ok && len(orderedLines) > 0 {
			plan["sampleTextPreview"] = orderedLines[:minInt(8, len(orderedLines))]
		}
	}
	return plan
}

func (h *AiHandler) buildDynamicDesignPlan(spec map[string]any, data map[string]any, params map[string]any, sampleAnalysis map[string]any) map[string]any {
	fitted := fitDynamicDesignSpecFromSample(spec, sampleAnalysis, params)
	style := resolveReportRenderStyle(fitted, data)
	plan := map[string]any{
		"templateName":            fmt.Sprint(fitted["title"]),
		"recommendedTitle":        renderTemplateText(fmt.Sprint(fitted["title"]), data),
		"recommendedHeaderFields": []string{"reportNo", "reportDate", "clientName"},
		"recommendedNotes":        []string{},
		"recommendedColumns":      []any{},
		"designStyle":             style,
		"fittedDesignSpec":        fitted,
		"previewHint":             "Dùng design spec đã sinh từ PDF mẫu để render preview và PDF cuối cùng",
	}
	if sampleAnalysis == nil {
		sampleAnalysis = h.analyzeSamplePdf(params)
	}
	if sampleAnalysis != nil {
		plan["samplePdfAnalysis"] = sampleAnalysis
		if orderedLines, ok := sampleAnalysis["orderedLines"].([]string); ok && len(orderedLines) > 0 {
			plan["sampleTextPreview"] = orderedLines[:minInt(8, len(orderedLines))]
		}
	}
	return plan
}

func fitDynamicDesignSpecFromSample(spec map[string]any, sampleAnalysis map[string]any, params map[string]any) map[string]any {
	fitted := deepCloneReportMap(spec)
	if len(fitted) == 0 {
		fitted = map[string]any{}
	}
	fitted = inferQuotationSpecFromSampleText(fitted, sampleAnalysis)

	style := deepCloneReportMap(toMapAny(fitted["style"]))
	if len(style) == 0 {
		style = map[string]any{}
	}

	p := toMapAny(sampleAnalysis["palette"])
	light := toMapAny(p["light"])
	dark := toMapAny(p["dark"])
	themeMode := selectReportThemeMode(params, fitted)
	active := light
	if themeMode == "dark" {
		active = dark
	}
	if len(active) == 0 {
		active = defaultThemePalette(themeMode)
	}

	mergeMissingStyle(style, active)
	if len(light) > 0 || len(dark) > 0 {
		style["light"] = light
		style["dark"] = dark
	}
	style["themeMode"] = themeMode
	fitted["style"] = style

	if imageHints, ok := sampleAnalysis["imageHints"].([]any); ok && len(imageHints) > 0 {
		first := toMapAny(imageHints[0])
		if logoURL := strings.TrimSpace(fmt.Sprint(first["url"])); logoURL != "" {
			fitted["logo"] = map[string]any{
				"imageUrl": logoURL,
				"fit":      "contain",
				"position": "header-left",
			}
		}
	}
	if locks := toMapAny(sampleAnalysis["layoutLocks"]); len(locks) > 0 {
		if tableBox := toMapAny(locks["tableBox"]); len(tableBox) > 0 {
			table := deepCloneReportMap(toMapAny(fitted["table"]))
			if len(table) > 0 {
				table["anchor"] = tableBox
				table["lockToSample"] = true
				fitted["table"] = table
			}
		}
		if logoBox := toMapAny(locks["logoBox"]); len(logoBox) > 0 {
			logo := deepCloneReportMap(toMapAny(fitted["logo"]))
			logo["box"] = logoBox
			logo["lockToSample"] = true
			fitted["logo"] = logo
		}
	}

	table := deepCloneReportMap(toMapAny(fitted["table"]))
	if len(table) > 0 {
		tableStyle := deepCloneReportMap(toMapAny(table["style"]))
		if len(tableStyle) == 0 {
			tableStyle = map[string]any{}
		}
		for _, key := range []string{"tableHeaderBgColor", "tableHeaderTextColor", "tableBorderColor", "tableRowBgColor", "tableAltRowBgColor"} {
			if v := strings.TrimSpace(fmt.Sprint(style[key])); v != "" && v != "<nil>" {
				tableStyle[key] = v
			}
		}
		table["style"] = tableStyle
		fitted["table"] = table
	}

	fitted["designFit"] = map[string]any{
		"mode":             "sample_pdf_auto_fit",
		"themeMode":        themeMode,
		"logoFromSample":   fitted["logo"] != nil,
		"fittedAtUtc":      time.Now().UTC().Format(time.RFC3339),
		"hasSamplePalette": len(p) > 0,
	}
	if overrides := toMapAny(params["designOverrides"]); len(overrides) > 0 {
		mergeReportMapRecursive(fitted, overrides)
		fitted["designFitOverrides"] = map[string]any{"applied": true, "keys": mapKeys(overrides)}
	}
	return fitted
}

func inferQuotationSpecFromSampleText(spec map[string]any, sampleAnalysis map[string]any) map[string]any {
	orderedLines, _ := sampleAnalysis["orderedLines"].([]string)
	if len(orderedLines) == 0 {
		return spec
	}
	lowerLines := make([]string, 0, len(orderedLines))
	for _, line := range orderedLines {
		lowerLines = append(lowerLines, strings.ToLower(strings.TrimSpace(line)))
	}
	isQuotation := false
	for _, line := range lowerLines {
		if strings.Contains(line, "bảng báo giá") || strings.Contains(line, "kính gửi") || strings.Contains(line, "thành tiền") {
			isQuotation = true
			break
		}
	}
	if !isQuotation {
		return spec
	}

	out := deepCloneReportMap(spec)
	if len(out) == 0 {
		out = map[string]any{}
	}
	out["layoutKind"] = "quotation-grouped-table"

	if strings.TrimSpace(fmt.Sprint(out["title"])) == "" {
		for _, line := range orderedLines {
			t := strings.TrimSpace(line)
			if strings.Contains(strings.ToLower(t), "bảng báo giá") {
				out["title"] = t
				break
			}
		}
	}

	company := deepCloneReportMap(toMapAny(out["company"]))
	if len(company) == 0 {
		company = map[string]any{}
	}
	company["name"] = firstNonEmptyString(fmt.Sprint(company["name"]), "{company.name}")
	company["address"] = firstNonEmptyString(fmt.Sprint(company["address"]), "{company.address}")
	company["taxCode"] = firstNonEmptyString(fmt.Sprint(company["taxCode"]), "{company.tax_code}")
	company["website"] = firstNonEmptyString(fmt.Sprint(company["website"]), "{company.website}")
	for _, line := range orderedLines[:minInt(6, len(orderedLines))] {
		t := strings.TrimSpace(line)
		if m := reportSampleMSTPattern.FindStringSubmatch(t); len(m) >= 3 {
			if strings.TrimSpace(m[1]) != "" {
				company["nameSample"] = strings.TrimSpace(m[1])
			}
			company["taxCodeSample"] = strings.TrimSpace(m[2])
		}
		if strings.HasPrefix(strings.ToLower(t), "địa chỉ:") {
			company["addressSample"] = strings.TrimSpace(strings.TrimPrefix(t, "Địa chỉ:"))
		}
		if strings.HasPrefix(strings.ToLower(t), "website:") {
			company["websiteSample"] = strings.TrimSpace(strings.TrimPrefix(t, "Website:"))
		}
	}
	out["company"] = company

	quotation := deepCloneReportMap(toMapAny(out["quotation"]))
	if len(quotation) == 0 {
		quotation = map[string]any{}
	}
	quotation["recipientToken"] = firstNonEmptyString(fmt.Sprint(quotation["recipientToken"]), "client.company")
	quotation["addressToken"] = firstNonEmptyString(fmt.Sprint(quotation["addressToken"]), "client.address")
	quotation["contactToken"] = firstNonEmptyString(fmt.Sprint(quotation["contactToken"]), "client.contact")
	quotation["quotationNoToken"] = firstNonEmptyString(fmt.Sprint(quotation["quotationNoToken"]), "quotation_no")
	quotation["dateToken"] = firstNonEmptyString(fmt.Sprint(quotation["dateToken"]), "date")
	quotation["validUntilToken"] = firstNonEmptyString(fmt.Sprint(quotation["validUntilToken"]), "valid_until")
	quotation["salesToken"] = firstNonEmptyString(fmt.Sprint(quotation["salesToken"]), "sales.name")
	quotation["amountWordsToken"] = firstNonEmptyString(fmt.Sprint(quotation["amountWordsToken"]), "amount_words")
	quotation["recipientLabel"] = firstNonEmptyString(fmt.Sprint(quotation["recipientLabel"]), "Kính gửi")
	quotation["addressLabel"] = firstNonEmptyString(fmt.Sprint(quotation["addressLabel"]), "Địa chỉ")
	quotation["contactLabel"] = firstNonEmptyString(fmt.Sprint(quotation["contactLabel"]), "Người liên hệ")
	quotation["quotationNoLabel"] = firstNonEmptyString(fmt.Sprint(quotation["quotationNoLabel"]), "Số")
	quotation["dateLabel"] = firstNonEmptyString(fmt.Sprint(quotation["dateLabel"]), "Ngày")
	quotation["validUntilLabel"] = firstNonEmptyString(fmt.Sprint(quotation["validUntilLabel"]), "Hiệu lực đến")
	quotation["salesLabel"] = firstNonEmptyString(fmt.Sprint(quotation["salesLabel"]), "NVKD")

	for _, line := range orderedLines {
		t := strings.TrimSpace(line)
		if m := reportSampleQuoteNoPattern.FindStringSubmatch(t); len(m) >= 3 {
			quotation["recipientSample"] = strings.TrimSpace(m[1])
			quotation["quotationNoSample"] = strings.TrimSpace(m[2])
			continue
		}
		if m := reportSampleDatePattern.FindStringSubmatch(t); len(m) >= 3 {
			quotation["addressSample"] = strings.TrimSpace(m[1])
			quotation["dateSample"] = strings.TrimSpace(m[2])
			continue
		}
		if m := reportSampleContactPattern.FindStringSubmatch(t); len(m) >= 3 {
			quotation["contactSample"] = strings.TrimSpace(m[1])
			quotation["validUntilSample"] = strings.TrimSpace(m[2])
			continue
		}
		if strings.HasPrefix(strings.ToLower(t), "nvkd:") {
			quotation["salesSample"] = strings.TrimSpace(strings.TrimPrefix(t, "NVKD:"))
		}
	}
	out["quotation"] = quotation

	table := deepCloneReportMap(toMapAny(out["table"]))
	if len(table) == 0 {
		table = map[string]any{}
	}
	if len(stringSliceFromAny(table["headers"])) == 0 {
		table["headers"] = []string{"TT", "Tên sản phẩm / Quy cách", "Đơn vị", "C.Rộng", "C.Dài", "Số tấm", "K.Lượng", "Đơn giá (VNĐ)", "Thành tiền (VNĐ)"}
	}
	if len(stringSliceFromAny(table["fields"])) == 0 {
		table["fields"] = []string{"__index", "name", "unit", "width", "length", "quantity", "weight", "unit_price", "amount"}
	}
	if len(floatSliceFromAny(table["widths"])) == 0 {
		table["widths"] = []float64{7, 63, 10, 15, 15, 15, 17, 23, 25}
	}
	table["grouped"] = true
	out["table"] = table

	if firstNonEmptyString(fmt.Sprint(out["intro"])) == "" {
		introLines := extractLinesBetweenAnchors(orderedLines, []string{"cảm ơn quý khách", "chúng tôi xin gửi báo giá"}, []string{"tt tên sản phẩm", "tt  tên sản phẩm", "i.", "i. "}, 3)
		if len(introLines) > 0 {
			out["intro"] = strings.Join(introLines, " ")
		}
	}

	if len(stringSliceFromAny(out["notes"])) == 0 {
		out["notes"] = extractLinesAfterAnchor(orderedLines, "Ghi chú:", 4)
	}
	if len(stringSliceFromAny(out["paymentTerms"])) == 0 {
		out["paymentTerms"] = extractLinesAfterAnchor(orderedLines, "Thông tin tài khoản", 2)
	}
	for _, line := range orderedLines {
		t := strings.TrimSpace(line)
		lower := strings.ToLower(t)
		if strings.Contains(lower, "thông tin tài khoản") {
			quotation["bankTitle"] = firstNonEmptyString(fmt.Sprint(quotation["bankTitle"]), t)
		}
		if strings.Contains(lower, "đại diện bên mua") {
			quotation["buyerLabel"] = firstNonEmptyString(fmt.Sprint(quotation["buyerLabel"]), t)
		}
		if strings.Contains(lower, "đại diện bên bán") {
			quotation["sellerLabel"] = firstNonEmptyString(fmt.Sprint(quotation["sellerLabel"]), t)
		}
	}
	out["quotation"] = quotation

	return out
}

func mergeReportMapRecursive(dst, src map[string]any) {
	for k, v := range src {
		srcMap, srcIsMap := v.(map[string]any)
		dstMap, dstIsMap := dst[k].(map[string]any)
		if srcIsMap && dstIsMap {
			mergeReportMapRecursive(dstMap, srcMap)
			dst[k] = dstMap
			continue
		}
		dst[k] = v
	}
}

func mapKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func firstNonEmptyString(values ...string) string {
	for _, v := range values {
		t := strings.TrimSpace(v)
		if t != "" && t != "<nil>" {
			return t
		}
	}
	return ""
}

func splitWebsiteForHeader(raw string) (string, string) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return "", ""
	}
	replacer := strings.NewReplacer("|", " ", ",", " ", ";", " ", "\t", " ", "\n", " ")
	normalized := replacer.Replace(text)
	parts := strings.Fields(normalized)
	urls := make([]string, 0, 2)
	for _, part := range parts {
		lower := strings.ToLower(strings.TrimSpace(part))
		if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.Contains(lower, ".") {
			urls = append(urls, part)
			if len(urls) >= 2 {
				break
			}
		}
	}
	if len(urls) == 0 {
		return text, ""
	}
	if len(urls) == 1 {
		return urls[0], ""
	}
	return urls[0], urls[1]
}

func extractLinesAfterAnchor(lines []string, anchor string, max int) []string {
	anchorLower := strings.ToLower(strings.TrimSpace(anchor))
	if anchorLower == "" || max <= 0 {
		return nil
	}
	for i, line := range lines {
		if strings.Contains(strings.ToLower(line), anchorLower) {
			out := make([]string, 0, max)
			for j := i + 1; j < len(lines) && len(out) < max; j++ {
				t := strings.TrimSpace(lines[j])
				if t == "" {
					continue
				}
				if strings.HasPrefix(strings.ToLower(t), "đại diện") || strings.HasPrefix(strings.ToLower(t), "trang ") {
					break
				}
				out = append(out, t)
			}
			return out
		}
	}
	return nil
}

func extractLinesBetweenAnchors(lines []string, startHints []string, stopHints []string, max int) []string {
	if len(lines) == 0 || len(startHints) == 0 || max <= 0 {
		return nil
	}
	startIdx := -1
	for i, line := range lines {
		lower := strings.ToLower(strings.TrimSpace(line))
		for _, hint := range startHints {
			if strings.Contains(lower, strings.ToLower(strings.TrimSpace(hint))) {
				startIdx = i
				break
			}
		}
		if startIdx >= 0 {
			break
		}
	}
	if startIdx < 0 {
		return nil
	}
	out := make([]string, 0, max)
	for i := startIdx; i < len(lines) && len(out) < max; i++ {
		text := strings.TrimSpace(lines[i])
		if text == "" {
			continue
		}
		if i > startIdx {
			lower := strings.ToLower(text)
			stop := false
			for _, hint := range stopHints {
				if strings.Contains(lower, strings.ToLower(strings.TrimSpace(hint))) {
					stop = true
					break
				}
			}
			if stop {
				break
			}
		}
		out = append(out, text)
	}
	return out
}

func buildReportDesignKit(spec map[string]any, variableIDs []string, sampleAnalysis map[string]any, params map[string]any) map[string]any {
	themeMode := selectReportThemeMode(params, spec)
	palette := toMapAny(sampleAnalysis["palette"])
	if len(palette) == 0 {
		palette = map[string]any{
			"light": defaultThemePalette("light"),
			"dark":  defaultThemePalette("dark"),
		}
	}

	logo := map[string]any{}
	if imageHints, ok := sampleAnalysis["imageHints"].([]any); ok && len(imageHints) > 0 {
		logo = toMapAny(imageHints[0])
	}

	table := toMapAny(spec["table"])
	return map[string]any{
		"themeMode":       themeMode,
		"theme":           palette,
		"logo":            logo,
		"renderArchetype": buildReportRenderArchetype(spec, sampleAnalysis),
		"table": map[string]any{
			"headers": table["headers"],
			"fields":  table["fields"],
			"widths":  table["widths"],
			"style":   table["style"],
		},
		"components": map[string]any{
			"logo":          map[string]any{"required": true, "fromSample": len(logo) > 0},
			"table":         map[string]any{"required": true, "dataKeys": []string{"items", "rows", "list"}},
			"dynamicFields": map[string]any{"count": len(variableIDs), "keys": variableIDs},
		},
		"qualityRules": []string{
			"Ưu tiên render theo fittedDesignSpec để giữ tỉ lệ bố cục giống PDF mẫu",
			"Logo lấy từ sample nếu có imageHints; fallback sang logo runtime",
			"Bảng dữ liệu phải map từ trigger.pdf_data và luôn có items/rows/list",
			"Màu chữ/nền chọn theo themeMode và palette từ sample",
		},
	}
}

func buildReportRenderArchetype(spec map[string]any, sampleAnalysis map[string]any) map[string]any {
	company := toMapAny(spec["company"])
	quotation := toMapAny(spec["quotation"])
	table := toMapAny(spec["table"])
	logo := toMapAny(spec["logo"])
	imageHints, _ := sampleAnalysis["imageHints"].([]any)
	return map[string]any{
		"engine":      "gofpdf",
		"sourceModel": "go-pdf-maroto-quotation",
		"family": map[bool]string{
			true:  "quotation_grouped_a4_vi",
			false: "dynamic_report_a4_vi",
		}[isQuotationGroupedSpec(spec)],
		"layoutKind": firstNonEmptyString(fmt.Sprint(spec["layoutKind"]), "dynamic-pdf-template"),
		"header": map[string]any{
			"hasLogo":          len(logo) > 0 || len(imageHints) > 0,
			"logoPosition":     firstNonEmptyString(fmt.Sprint(logo["position"]), "header-left"),
			"companyNameToken": firstNonEmptyString(fmt.Sprint(company["name"]), "{company.name}"),
			"taxCodeToken":     firstNonEmptyString(fmt.Sprint(company["taxCode"]), "{company.tax_code}"),
			"websiteToken":     firstNonEmptyString(fmt.Sprint(company["website"]), "{company.website}"),
			"recipientToken":   firstNonEmptyString(fmt.Sprint(quotation["recipientToken"]), "client.company"),
		},
		"table": map[string]any{
			"grouped":        isQuotationGroupedSpec(spec),
			"headers":        stringSliceFromAny(table["headers"]),
			"fields":         stringSliceFromAny(table["fields"]),
			"widths":         floatSliceFromAny(table["widths"]),
			"subtotalFormat": "Cộng nhóm {roman} - chưa VAT {vat_rate}%",
		},
		"totals": map[string]any{
			"lineOrder":        []string{"A", "B", "C", "D"},
			"amountWordsToken": firstNonEmptyString(fmt.Sprint(quotation["amountWordsToken"]), "amount_words"),
		},
		"signatures": map[string]any{
			"buyerLabel":      firstNonEmptyString(fmt.Sprint(quotation["buyerLabel"]), "ĐẠI DIỆN BÊN MUA"),
			"sellerLabel":     firstNonEmptyString(fmt.Sprint(quotation["sellerLabel"]), "ĐẠI DIỆN BÊN BÁN"),
			"sellerNameToken": "sales.name",
		},
	}
}

func deepCloneReportMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return map[string]any{}
	}
	b, err := json.Marshal(input)
	if err != nil {
		return cloneReportMapAny(input)
	}
	out := map[string]any{}
	if err := json.Unmarshal(b, &out); err != nil {
		return cloneReportMapAny(input)
	}
	return out
}

func mergeMissingStyle(dst, src map[string]any) {
	for k, v := range src {
		if strings.TrimSpace(fmt.Sprint(dst[k])) == "" || fmt.Sprint(dst[k]) == "<nil>" {
			dst[k] = v
		}
	}
}

func selectReportThemeMode(params map[string]any, spec map[string]any) string {
	for _, key := range []string{"themeMode", "colorMode", "designMode", "mode"} {
		if mode := strings.ToLower(strings.TrimSpace(paramStr(params, key))); mode == "dark" || mode == "light" {
			return mode
		}
	}
	if mode := strings.ToLower(strings.TrimSpace(fmt.Sprint(spec["themeMode"]))); mode == "dark" || mode == "light" {
		return mode
	}
	return "light"
}

func defaultThemePalette(mode string) map[string]any {
	if mode == "dark" {
		return map[string]any{
			"pageBackground":       "#0B1020",
			"textColor":            "#E5E7EB",
			"titleColor":           "#F9FAFB",
			"headerBgColor":        "#111827",
			"headerTextColor":      "#E5E7EB",
			"tableHeaderBgColor":   "#1F2937",
			"tableHeaderTextColor": "#F9FAFB",
			"tableBorderColor":     "#374151",
			"tableRowBgColor":      "#0F172A",
			"tableAltRowBgColor":   "#111827",
		}
	}
	return map[string]any{
		"pageBackground":       "#FFFFFF",
		"textColor":            "#111827",
		"titleColor":           "#111827",
		"headerBgColor":        "#FFFFFF",
		"headerTextColor":      "#111827",
		"tableHeaderBgColor":   "#F3F4F6",
		"tableHeaderTextColor": "#111827",
		"tableBorderColor":     "#D1D5DB",
		"tableRowBgColor":      "#FFFFFF",
		"tableAltRowBgColor":   "#F9FAFB",
	}
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
	if shouldPreferOverlayLockedRender(spec) {
		overlayItems := parseReportCanvasTextItems(spec)
		if len(overlayItems) > 0 {
			pdfBytes, err := renderOverlayTemplateSpecPDFToBytes(spec, data, overlayItems)
			if err == nil {
				return pdfBytes, "strict_overlay", nil
			}
			return nil, "strict_overlay", err
		}
	}

	pdfBytes, err := renderDynamicDesignSpecPDFToBytes(spec, data)
	if err == nil {
		return pdfBytes, "primary", nil
	}
	if shouldDisableLayoutFallback(spec) {
		return nil, "primary", err
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
	if shouldPreferOverlayLockedRender(spec) {
		if overlayItems := parseReportCanvasTextItems(spec); len(overlayItems) > 0 {
			return renderOverlayTemplateSpecPDFToBytes(spec, data, overlayItems)
		}
	}

	if isQuotationGroupedSpec(spec) {
		return renderQuotationGroupedDesignSpecPDFToBytes(spec, data)
	}

	if overlayItems := parseReportCanvasTextItems(spec); len(overlayItems) > 0 {
		return renderOverlayTemplateSpecPDFToBytes(spec, data, overlayItems)
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(12, 12, 12)
	pdf.SetAutoPageBreak(true, 12)
	pdf.AddPage()
	fontName := registerTemplateFont(pdf)
	style := resolveReportRenderStyle(spec, data)
	applyReportPageBackground(pdf, style)
	applyReportTextColor(pdf, style, "textColor", 0, 0, 0)

	title := renderTemplateText(fmt.Sprint(spec["title"]), data)
	if title == "" {
		title = "BÁO CÁO"
	}
	applyReportTextColor(pdf, style, "titleColor", 0, 0, 0)
	pdf.SetFont(fontName, "B", 13)
	pdf.CellFormat(0, 7, title, "", 1, "C", false, 0, "")
	pdf.Ln(2)
	applyReportTextColor(pdf, style, "textColor", 0, 0, 0)

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
		if anchor := toMapAny(tableMap["anchor"]); len(anchor) > 0 {
			anchorX := numberFromAny(anchor["x"])
			anchorY := numberFromAny(anchor["y"])
			if anchorX > 0 && anchorY > 0 {
				renderDynamicDesignSpecTableAt(pdf, tableMap, data, anchorX, anchorY, style)
			} else {
				renderDynamicDesignSpecTable(pdf, tableMap, data, style)
			}
		} else {
			renderDynamicDesignSpecTable(pdf, tableMap, data, style)
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
	applyReportTextColor(pdf, style, "textColor", 0, 0, 0)

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

func shouldEnforceStrictReportLayout(params map[string]any, spec map[string]any) bool {
	if paramBool(params, "strictLayout", false) || paramBool(params, "layoutStrict", false) {
		return true
	}
	locks := toMapAny(spec["layoutLocks"])
	if len(locks) == 0 {
		return false
	}
	if boolFromAny(locks["strict"]) || boolFromAny(locks["lockLayout"]) || boolFromAny(locks["lockPositions"]) {
		return true
	}
	return false
}

func shouldPreferOverlayLockedRender(spec map[string]any) bool {
	if len(parseReportCanvasTextItems(spec)) == 0 {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(fmt.Sprint(spec["renderMode"])), "overlay-locked") {
		return true
	}
	locks := toMapAny(spec["layoutLocks"])
	if len(locks) == 0 {
		return false
	}
	if boolFromAny(locks["preferOverlayRender"]) || boolFromAny(locks["lockPositions"]) {
		return true
	}
	if boolFromAny(locks["strict"]) && boolFromAny(locks["lockLayout"]) {
		return true
	}
	return false
}

func shouldDisableLayoutFallback(spec map[string]any) bool {
	locks := toMapAny(spec["layoutLocks"])
	if len(locks) == 0 {
		return false
	}
	return boolFromAny(locks["disableFallback"]) || boolFromAny(locks["strict"]) || boolFromAny(locks["lockLayout"])
}

func renderQuotationGroupedDesignSpecPDFToBytes(spec map[string]any, data map[string]any) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(10, 10, 10)
	pdf.SetAutoPageBreak(true, 12)
	fontName := registerTemplateFont(pdf)

	company := toMapAny(spec["company"])
	quotation := toMapAny(spec["quotation"])
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
		const (
			textLeft  = 30.0
			textWidth = 170.0
		)

		pdf.SetXY(textLeft, 10.0)
		pdf.SetTextColor(0, 120, 70)
		pdf.SetFont(fontName, "B", 11)
		pdf.CellFormat(textWidth, 5, companyName, "", 1, "L", false, 0, "")

		pdf.SetXY(textLeft, 14.6)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetFont(fontName, "", 9)
		if companyAddress != "" {
			pdf.CellFormat(textWidth, 4, "Địa chỉ: "+companyAddress, "", 1, "L", false, 0, "")
		} else {
			pdf.CellFormat(textWidth, 4, "", "", 1, "L", false, 0, "")
		}

		leftWebsite, rightWebsite := splitWebsiteForHeader(website)
		pdf.SetXY(textLeft, 18.9)
		pdf.CellFormat(36, 4, strings.TrimSpace("MST: "+taxCode), "", 0, "L", false, 0, "")
		pdf.CellFormat(84, 4, leftWebsite, "", 0, "C", false, 0, "")
		pdf.CellFormat(50, 4, rightWebsite, "", 1, "R", false, 0, "")

		_, currY := pdf.GetX(), pdf.GetY()
		pdf.SetY(currY + 2.8)
	})

	pdf.SetFooterFunc(func() {
		pdf.SetY(-15)
		pdf.SetFont(fontName, "", 8)
		pageStr := fmt.Sprintf("Trang %d / {nb}", pdf.PageNo())
		pdf.CellFormat(190, 10, pageStr, "", 0, "R", false, 0, "")
	})
	pdf.AliasNbPages("")

	pdf.AddPage()
	const titleY = 24.0
	pdf.SetXY(10, titleY)
	pdf.SetFont(fontName, "B", 13)
	title := renderFirstTemplateValue(data, fmt.Sprint(spec["title"]), "{report_title}", "BÁO CÁO")
	pdf.SetTextColor(0, 120, 70)
	pdf.CellFormat(190, 6.2, title, "", 1, "C", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
	pdf.SetY(titleY + 8.4)

	renderQuotationHeaderRows(pdf, fontName, data, quotation)

	intro := renderFirstTemplateValue(data, fmt.Sprint(spec["intro"]), "{intro}")
	if strings.TrimSpace(intro) != "" {
		pdf.SetFont(fontName, "", 8.5)
		pdf.MultiCell(190, 4.2, intro, "", "L", false)
		pdf.Ln(2)
	}

	renderQuotationGroupedTable(pdf, fontName, table, data)
	renderQuotationTotals(pdf, fontName, data)
	renderQuotationNotesAndSignatures(pdf, fontName, notes, paymentTerms, data, quotation)

	buf := new(bytes.Buffer)
	if err := pdf.Output(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func renderQuotationHeaderRows(pdf *gofpdf.Fpdf, fontName string, data map[string]any, quotation map[string]any) {
	pdf.SetFont(fontName, "B", 9)
	recipientLabel := quotationString(quotation, "recipientLabel", "Kính gửi")
	addressLabel := quotationString(quotation, "addressLabel", "Địa chỉ")
	contactLabel := quotationString(quotation, "contactLabel", "Người liên hệ")
	quotationNoLabel := quotationString(quotation, "quotationNoLabel", "Số")
	dateLabel := quotationString(quotation, "dateLabel", "Ngày")
	validUntilLabel := quotationString(quotation, "validUntilLabel", "Hiệu lực đến")
	salesLabel := quotationString(quotation, "salesLabel", "NVKD")

	clientCompany := renderQuotationValue(data, quotation, "recipientToken", "{client.company}", "{customerName}", "{clientName}")
	clientAddress := renderQuotationValue(data, quotation, "addressToken", "{client.address}", "{companyAddress}")
	clientContact := renderQuotationValue(data, quotation, "contactToken", "{client.contact}", "{contactName}")
	quotationNo := renderQuotationValue(data, quotation, "quotationNoToken", "{quotation_no}", "{quotationNo}", "{reportNo}")
	date := renderQuotationValue(data, quotation, "dateToken", "{date}", "{reportDate}")
	validUntil := renderQuotationValue(data, quotation, "validUntilToken", "{valid_until}", "{validUntil}")
	sales := renderQuotationValue(data, quotation, "salesToken", "{sales.name}", "{salesName}", "{nvkd}")

	pdf.CellFormat(120, 5, recipientLabel+": "+clientCompany, "", 0, "L", false, 0, "")
	pdf.CellFormat(70, 5, quotationNoLabel+": "+quotationNo, "", 1, "R", false, 0, "")

	pdf.SetFont(fontName, "", 9)
	pdf.CellFormat(128, 5, addressLabel+": "+clientAddress, "", 0, "L", false, 0, "")
	pdf.CellFormat(62, 5, dateLabel+": "+date, "", 1, "R", false, 0, "")

	pdf.CellFormat(120, 5, contactLabel+": "+clientContact, "", 0, "L", false, 0, "")
	pdf.CellFormat(70, 5, validUntilLabel+": "+validUntil, "", 1, "R", false, 0, "")

	pdf.SetFont(fontName, "B", 9)
	pdf.CellFormat(190, 5, fmt.Sprintf("%s: %s", salesLabel, sales), "", 1, "L", false, 0, "")
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

func renderQuotationNotesAndSignatures(pdf *gofpdf.Fpdf, fontName string, notes []string, paymentTerms []string, data map[string]any, quotation map[string]any) {
	pdf.Ln(2)
	amountText := renderQuotationValue(data, quotation, "amountWordsToken", "{amount_words}", "{bang_chu}")
	amountWordsLabel := quotationString(quotation, "amountWordsLabel", "Bằng chữ")
	noteTitle := quotationString(quotation, "noteTitle", "Ghi chú")
	paymentTitle := quotationString(quotation, "paymentTitle", "Phương thức thanh toán")
	bankTitle := quotationString(quotation, "bankTitle", "Thông tin thanh toán")
	if amountText != "" {
		pdf.SetFont(fontName, "B", 8.5)
		pdf.CellFormat(190, 5, amountWordsLabel+": "+amountText, "", 1, "L", false, 0, "")
	}
	if len(notes) > 0 {
		pdf.SetFont(fontName, "B", 8)
		pdf.CellFormat(190, 4, noteTitle+":", "", 1, "L", false, 0, "")
		pdf.SetFont(fontName, "", 7.5)
		for _, note := range notes {
			pdf.MultiCell(190, 4, renderTemplateText(note, data), "", "L", false)
		}
	}
	if len(paymentTerms) > 0 {
		pdf.SetFont(fontName, "", 8)
		pdf.CellFormat(190, 4, paymentTitle+":", "", 1, "L", false, 0, "")
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
		pdf.CellFormat(190, 4, bankTitle+":", "", 1, "L", false, 0, "")
		pdf.SetFont(fontName, "", 8)
		pdf.MultiCell(190, 4, bankInfo, "", "L", false)
	}
	pdf.Ln(2)
	pdf.SetFont(fontName, "B", 8.5)
	buyerLabel := renderFirstTemplateValue(data, "{signature.buyer_label}", "{buyer_label}", quotationString(quotation, "buyerLabel", "ĐẠI DIỆN BÊN MUA"))
	sellerLabel := renderFirstTemplateValue(data, "{signature.seller_label}", "{seller_label}", quotationString(quotation, "sellerLabel", "ĐẠI DIỆN BÊN BÁN"))
	pdf.CellFormat(95, 5, buyerLabel, "", 0, "C", false, 0, "")
	pdf.CellFormat(95, 5, sellerLabel, "", 1, "C", false, 0, "")
	pdf.Ln(14)
	pdf.CellFormat(95, 5, "", "", 0, "C", false, 0, "")
	pdf.CellFormat(95, 5, renderTemplateText("{sales.name}", data), "", 1, "C", false, 0, "")
}

func quotationString(quotation map[string]any, key string, fallback string) string {
	if value := strings.TrimSpace(fmt.Sprint(quotation[key])); value != "" && value != "<nil>" {
		return value
	}
	return fallback
}

func renderQuotationValue(data map[string]any, quotation map[string]any, tokenKey string, fallbacks ...string) string {
	token := strings.TrimSpace(fmt.Sprint(quotation[tokenKey]))
	paths := make([]string, 0, len(fallbacks)+1)
	if token != "" && token != "<nil>" {
		paths = append(paths, "{"+token+"}")
	}
	paths = append(paths, fallbacks...)
	return renderFirstTemplateValue(data, paths...)
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
	style := resolveReportRenderStyle(spec, data)
	pageCount := 1
	for _, item := range items {
		if item.Page > pageCount {
			pageCount = item.Page
		}
	}

	for page := 1; page <= pageCount; page++ {
		pdf.AddPage()
		applyReportPageBackground(pdf, style)
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
			anchorMap := toMapAny(tableMap["anchor"])
			rawTableX := numberFromAny(firstResolved(tableMap, "x", "startX", "anchor.x"))
			rawTableY := numberFromAny(firstResolved(tableMap, "y", "startY", "anchor.y"))
			if rawTableX <= 0 {
				rawTableX = numberFromAny(anchorMap["x"])
			}
			if rawTableY <= 0 {
				rawTableY = numberFromAny(anchorMap["y"])
			}
			tableX, tableY := coord.toPDFMM(rawTableX, rawTableY)
			if strings.EqualFold(strings.TrimSpace(fmt.Sprint(anchorMap["unit"])), "mm") {
				tableX = rawTableX
				tableY = rawTableY
			}
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
				renderDynamicDesignSpecTableAt(pdf, tableMap, data, tableX, tableY, style)
			}
		}
	}

	buf := new(bytes.Buffer)
	if err := pdf.Output(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func renderDynamicDesignSpecTableAt(pdf *gofpdf.Fpdf, table map[string]any, data map[string]any, startX, startY float64, style map[string]any) {
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
	applyReportTableStrokeColor(pdf, style)
	applyReportTableHeaderFill(pdf, style)
	applyReportTextColor(pdf, style, "tableHeaderTextColor", 17, 24, 39)
	pdf.SetFont("Arial", "B", 8)
	for i, title := range headers {
		pdf.CellFormat(widths[i], 7, renderTemplateText(title, data), "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	items := renderRowsFromData(data)
	rowFillA, rowFillB := resolveReportTableRowFills(style)
	pdf.SetFont("Arial", "", 8)
	applyReportTextColor(pdf, style, "textColor", 0, 0, 0)
	for rowIndex, rowAny := range items {
		if rowIndex%2 == 0 {
			pdf.SetFillColor(rowFillA[0], rowFillA[1], rowFillA[2])
		} else {
			pdf.SetFillColor(rowFillB[0], rowFillB[1], rowFillB[2])
		}
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
			pdf.CellFormat(widths[colIndex], 5.5, value, "1", 0, align, true, 0, "")
		}
		pdf.Ln(-1)
	}
}

func renderDynamicDesignSpecTable(pdf *gofpdf.Fpdf, table map[string]any, data map[string]any, style map[string]any) {
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
	applyReportTableStrokeColor(pdf, style)
	applyReportTableHeaderFill(pdf, style)
	applyReportTextColor(pdf, style, "tableHeaderTextColor", 17, 24, 39)
	pdf.SetFont("Helvetica", "B", 8)
	for i, title := range headers {
		pdf.CellFormat(widths[i], 7, renderTemplateText(title, data), "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	items := renderRowsFromData(data)
	rowFillA, rowFillB := resolveReportTableRowFills(style)
	pdf.SetFont("Helvetica", "", 8)
	applyReportTextColor(pdf, style, "textColor", 0, 0, 0)
	for rowIndex, rowAny := range items {
		if rowIndex%2 == 0 {
			pdf.SetFillColor(rowFillA[0], rowFillA[1], rowFillA[2])
		} else {
			pdf.SetFillColor(rowFillB[0], rowFillB[1], rowFillB[2])
		}
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
			pdf.CellFormat(widths[colIndex], 5.5, value, "1", 0, align, true, 0, "")
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
	lineBoxes := make([]pdfExtractLineBox, 0, 300)
	for page := 1; page <= maxPages; page++ {
		contentFile := filepath.Join(extractDir, fmt.Sprintf("sample_Content_page_%d.txt", page))
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
			if len(orderedLines) >= 120 {
				break
			}
		}
	}

	appID := sanitizeAppID(paramStr(params, "appId"))
	if appID == "" {
		appID = "csm"
	}
	imageHints, _ := h.extractPDFImageHints(appID, inputPDF, workDir, selectedPages, "sample")
	palette := extractReportSamplePalette(extractDir, maxPages)
	layoutLocks := deriveReportLayoutLocks(lineBoxes, func() float64 {
		if len(dims) > 0 {
			return dims[0].Width
		}
		return 0
	}())

	lineBoxMaps := make([]map[string]any, 0, len(lineBoxes))
	for _, box := range lineBoxes {
		lineBoxMaps = append(lineBoxMaps, map[string]any{
			"text": box.Text,
			"x":    box.X,
			"y":    box.Y,
			"page": box.Page,
		})
	}

	pages := make([]map[string]any, 0, pageCount)
	for i := 0; i < pageCount; i++ {
		pages = append(pages, map[string]any{"page": i + 1, "width": dims[i].Width, "height": dims[i].Height})
	}
	return map[string]any{
		"source":        src,
		"pageCount":     pageCount,
		"pages":         pages,
		"lineBoxes":     lineBoxMaps,
		"layoutLocks":   layoutLocks,
		"orderedLines":  orderedLines,
		"imageHints":    imageHints,
		"palette":       palette,
		"analyzedAtUtc": time.Now().UTC().Format(time.RFC3339),
	}
}

func extractReportSamplePalette(extractDir string, maxPages int) map[string]any {
	colorCount := map[string]int{}
	for page := 1; page <= maxPages; page++ {
		contentFile := filepath.Join(extractDir, fmt.Sprintf("sample_Content_page_%d.txt", page))
		b, readErr := os.ReadFile(contentFile)
		if readErr != nil || len(b) == 0 {
			continue
		}
		text := string(b)
		for _, m := range reportPDFRGBColorPattern.FindAllStringSubmatch(text, -1) {
			r := clampReportColorChannel(toFloat(m[1]))
			g := clampReportColorChannel(toFloat(m[2]))
			bl := clampReportColorChannel(toFloat(m[3]))
			hex := fmt.Sprintf("#%02X%02X%02X", r, g, bl)
			colorCount[hex]++
		}
		for _, m := range reportPDFGrayColorPattern.FindAllStringSubmatch(text, -1) {
			v := clampReportColorChannel(toFloat(m[1]))
			hex := fmt.Sprintf("#%02X%02X%02X", v, v, v)
			colorCount[hex]++
		}
	}

	type pair struct {
		hex   string
		count int
	}
	pairs := make([]pair, 0, len(colorCount))
	for hex, count := range colorCount {
		pairs = append(pairs, pair{hex: hex, count: count})
	}
	sort.Slice(pairs, func(i, j int) bool {
		return pairs[i].count > pairs[j].count
	})

	detected := make([]map[string]any, 0, minInt(8, len(pairs)))
	for i := 0; i < minInt(8, len(pairs)); i++ {
		detected = append(detected, map[string]any{"hex": pairs[i].hex, "count": pairs[i].count})
	}

	primary := "#111827"
	secondary := "#F3F4F6"
	if len(pairs) > 0 {
		primary = pairs[0].hex
	}
	for _, p := range pairs {
		if reportColorDistance(primary, p.hex) > 120 {
			secondary = p.hex
			break
		}
	}

	if len(pairs) == 0 {
		return map[string]any{
			"detected": detected,
			"light":    defaultThemePalette("light"),
			"dark":     defaultThemePalette("dark"),
		}
	}

	light := map[string]any{
		"pageBackground":       "#FFFFFF",
		"textColor":            normalizeReadableTextColor(primary, "light"),
		"titleColor":           normalizeReadableTextColor(primary, "light"),
		"headerBgColor":        "#FFFFFF",
		"headerTextColor":      normalizeReadableTextColor(primary, "light"),
		"tableHeaderBgColor":   secondary,
		"tableHeaderTextColor": normalizeReadableTextColor(primary, "light"),
		"tableBorderColor":     primary,
		"tableRowBgColor":      "#FFFFFF",
		"tableAltRowBgColor":   "#F9FAFB",
	}
	dark := map[string]any{
		"pageBackground":       "#0B1020",
		"textColor":            normalizeReadableTextColor(primary, "dark"),
		"titleColor":           normalizeReadableTextColor(primary, "dark"),
		"headerBgColor":        "#111827",
		"headerTextColor":      "#E5E7EB",
		"tableHeaderBgColor":   blendReportHex(secondary, "#111827", 0.5),
		"tableHeaderTextColor": "#F9FAFB",
		"tableBorderColor":     blendReportHex(primary, "#374151", 0.5),
		"tableRowBgColor":      "#0F172A",
		"tableAltRowBgColor":   "#111827",
	}

	return map[string]any{
		"detected": detected,
		"light":    light,
		"dark":     dark,
	}
}

func clampReportColorChannel(v float64) int {
	if v <= 1 {
		v = v * 255
	}
	if v < 0 {
		v = 0
	}
	if v > 255 {
		v = 255
	}
	return int(math.Round(v))
}

func normalizeReadableTextColor(hex, mode string) string {
	r, g, b, ok := parseHexColor(hex)
	if !ok {
		if mode == "dark" {
			return "#E5E7EB"
		}
		return "#111827"
	}
	luminance := 0.2126*float64(r) + 0.7152*float64(g) + 0.0722*float64(b)
	if mode == "dark" {
		if luminance < 160 {
			return "#E5E7EB"
		}
		return hex
	}
	if luminance > 180 {
		return "#111827"
	}
	return hex
}

func reportColorDistance(a, b string) float64 {
	ar, ag, ab, okA := parseHexColor(a)
	br, bg, bb, okB := parseHexColor(b)
	if !okA || !okB {
		return 0
	}
	dr := float64(ar - br)
	dg := float64(ag - bg)
	db := float64(ab - bb)
	return math.Sqrt(dr*dr + dg*dg + db*db)
}

func blendReportHex(base, overlay string, ratio float64) string {
	if ratio < 0 {
		ratio = 0
	}
	if ratio > 1 {
		ratio = 1
	}
	br, bg, bb, okBase := parseHexColor(base)
	or, og, ob, okOverlay := parseHexColor(overlay)
	if !okBase || !okOverlay {
		return base
	}
	r := int(math.Round(float64(br)*(1-ratio) + float64(or)*ratio))
	g := int(math.Round(float64(bg)*(1-ratio) + float64(og)*ratio))
	b := int(math.Round(float64(bb)*(1-ratio) + float64(ob)*ratio))
	if r < 0 {
		r = 0
	}
	if g < 0 {
		g = 0
	}
	if b < 0 {
		b = 0
	}
	if r > 255 {
		r = 255
	}
	if g > 255 {
		g = 255
	}
	if b > 255 {
		b = 255
	}
	return fmt.Sprintf("#%02X%02X%02X", r, g, b)
}

func resolveReportRenderStyle(spec map[string]any, data map[string]any) map[string]any {
	style := deepCloneReportMap(toMapAny(spec["style"]))
	if len(style) == 0 {
		style = defaultThemePalette("light")
	}
	themeMode := strings.ToLower(strings.TrimSpace(fmt.Sprint(style["themeMode"])))
	if mode := strings.ToLower(strings.TrimSpace(fmt.Sprint(spec["themeMode"]))); mode == "light" || mode == "dark" {
		themeMode = mode
	}
	if mode := strings.ToLower(strings.TrimSpace(fmt.Sprint(data["themeMode"]))); mode == "light" || mode == "dark" {
		themeMode = mode
	}
	if themeMode != "dark" {
		themeMode = "light"
	}
	if themed := toMapAny(style[themeMode]); len(themed) > 0 {
		mergeMissingStyle(themed, defaultThemePalette(themeMode))
		for k, v := range themed {
			style[k] = v
		}
	}
	mergeMissingStyle(style, defaultThemePalette(themeMode))
	style["themeMode"] = themeMode
	return style
}

func applyReportPageBackground(pdf *gofpdf.Fpdf, style map[string]any) {
	r, g, b := reportHexOrDefault(style, "pageBackground", 255, 255, 255)
	pdf.SetFillColor(r, g, b)
	pdf.Rect(0, 0, 210, 297, "F")
}

func applyReportTextColor(pdf *gofpdf.Fpdf, style map[string]any, key string, dr, dg, db int) {
	r, g, b := reportHexOrDefault(style, key, dr, dg, db)
	pdf.SetTextColor(r, g, b)
}

func applyReportTableStrokeColor(pdf *gofpdf.Fpdf, style map[string]any) {
	r, g, b := reportHexOrDefault(style, "tableBorderColor", 209, 213, 219)
	pdf.SetDrawColor(r, g, b)
}

func applyReportTableHeaderFill(pdf *gofpdf.Fpdf, style map[string]any) {
	r, g, b := reportHexOrDefault(style, "tableHeaderBgColor", 243, 244, 246)
	pdf.SetFillColor(r, g, b)
}

func resolveReportTableRowFills(style map[string]any) ([3]int, [3]int) {
	r1, g1, b1 := reportHexOrDefault(style, "tableRowBgColor", 255, 255, 255)
	r2, g2, b2 := reportHexOrDefault(style, "tableAltRowBgColor", 249, 250, 251)
	return [3]int{r1, g1, b1}, [3]int{r2, g2, b2}
}

func reportHexOrDefault(style map[string]any, key string, dr, dg, db int) (int, int, int) {
	if r, g, b, ok := parseHexColor(fmt.Sprint(style[key])); ok {
		return r, g, b
	}
	return dr, dg, db
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
		if !isAllowedPdfSourcePath(pdfPath) {
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

func (m reportCoordinateMeta) toPDFPoints(x, y float64) (float64, float64) {
	if m.unit == "pt" {
		if m.origin == "top-left" && m.pageHeightPt > 0 {
			return x, m.pageHeightPt - y
		}
		return x, y
	}

	xPt := x * 72.0 / 25.4
	yPt := y * 72.0 / 25.4
	if m.origin == "top-left" && m.pageHeightPt > 0 {
		pageHeightPt := m.pageHeightPt
		if pageHeightPt > 0 && pageHeightPt < 250 {
			pageHeightPt = pageHeightPt * 72.0 / 25.4
		}
		yPt = pageHeightPt - yPt
	}
	return xPt, yPt
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
