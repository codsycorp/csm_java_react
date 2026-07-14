package handlers

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

type pdfOverlayTextItem struct {
	Page     int
	Text     string
	X        float64
	Y        float64
	FontSize int
	FontName string
	Color    string
	Opacity  float64
	Rotate   float64
}

func (h *AiHandler) handleAiLocalPdfOverlay(params map[string]any) map[string]any {
	appID := sanitizeAppID(paramStr(params, "appId"))
	if appID == "" {
		appID = "csm"
	}

	pdfBytes, src, err := h.resolvePdfInput(params)
	if err != nil {
		return map[string]any{"success": false, "errorCode": "PDF_INPUT_INVALID", "message": err.Error()}
	}
	if len(pdfBytes) == 0 {
		return map[string]any{"success": false, "errorCode": "PDF_INPUT_EMPTY", "message": "pdf input is empty"}
	}

	items := parsePdfOverlayItems(params["overlays"])
	if len(items) == 0 {
		return map[string]any{"success": false, "errorCode": "OVERLAY_EMPTY", "message": "overlays is empty"}
	}

	tmpRoot := filepath.Join(h.cfg.NativeDataDir, "tmp", "report_pdf_overlay")
	if mkErr := os.MkdirAll(tmpRoot, 0o755); mkErr != nil {
		return map[string]any{"success": false, "errorCode": "TMP_DIR_CREATE_FAILED", "message": mkErr.Error()}
	}

	jobID := fmt.Sprintf("pdfoverlay-%d", time.Now().UnixMilli())
	workDir, err := os.MkdirTemp(tmpRoot, jobID+"-")
	if err != nil {
		return map[string]any{"success": false, "errorCode": "TMP_WORKDIR_FAILED", "message": err.Error()}
	}
	defer os.RemoveAll(workDir)

	inputPdf := filepath.Join(workDir, "input.pdf")
	if err := os.WriteFile(inputPdf, pdfBytes, 0o644); err != nil {
		return map[string]any{"success": false, "errorCode": "PDF_WRITE_FAILED", "message": err.Error()}
	}

	currentPdf := inputPdf
	for idx, it := range items {
		nextPdf := filepath.Join(workDir, fmt.Sprintf("overlay_%04d.pdf", idx+1))
		wm, wmErr := buildOverlayWatermark(it)
		if wmErr != nil {
			return map[string]any{"success": false, "errorCode": "OVERLAY_ITEM_INVALID", "message": wmErr.Error(), "index": idx}
		}
		selected := []string{strconv.Itoa(maxInt(1, it.Page))}
		if err := api.AddWatermarksFile(currentPdf, nextPdf, selected, wm, nil); err != nil {
			return map[string]any{"success": false, "errorCode": "PDF_OVERLAY_FAILED", "message": err.Error(), "index": idx}
		}
		currentPdf = nextPdf
	}

	resultBytes, err := os.ReadFile(currentPdf)
	if err != nil {
		return map[string]any{"success": false, "errorCode": "PDF_READ_FAILED", "message": err.Error()}
	}

	publicDir := filepath.Join(h.cfg.DataDir, "public", "app_images", appID)
	if err := os.MkdirAll(publicDir, 0o755); err != nil {
		return map[string]any{"success": false, "errorCode": "PDF_PUBLIC_DIR_FAILED", "message": err.Error()}
	}

	outputName := sanitizePdfOutputName(paramStr(params, "outputName"))
	if outputName == "" {
		outputName = fmt.Sprintf("overlay_%d.pdf", time.Now().UnixMilli())
	}
	outputAbs := filepath.Join(publicDir, outputName)
	if err := os.WriteFile(outputAbs, resultBytes, 0o644); err != nil {
		return map[string]any{"success": false, "errorCode": "PDF_SAVE_FAILED", "message": err.Error()}
	}

	relPath := fmt.Sprintf("app_images/%s/%s", appID, outputName)
	res := map[string]any{
		"success":         true,
		"message":         "pdf_overlay_done",
		"source":          src,
		"jobId":           jobID,
		"pdfPath":         relPath,
		"pdfUrl":          "/" + relPath,
		"pdfSize":         len(resultBytes),
		"overlaysApplied": len(items),
		"convertedAtUtc":  time.Now().UTC().Format(time.RFC3339),
	}
	if paramBool(params, "returnBase64", false) {
		res["pdfBase64"] = base64.StdEncoding.EncodeToString(resultBytes)
	}
	return res
}

func (h *AiHandler) resolvePdfInput(params map[string]any) ([]byte, string, error) {
	pdfPath := normalizeDocxSourcePath(paramStr(params, "pdfPath"))
	if pdfPath != "" {
		if !isAllowedDocxSourcePath(pdfPath) {
			return nil, "", fmt.Errorf("pdfPath must be under app_images/ or reports/")
		}
		if p := h.rm.GetStaticFile(pdfPath); p != "" {
			if bytesData, err := os.ReadFile(p); err == nil {
				return bytesData, pdfPath, nil
			}
		}
		publicFallback := filepath.Join(h.cfg.DataDir, "public", filepath.FromSlash(pdfPath))
		if bytesData, err := os.ReadFile(publicFallback); err == nil {
			return bytesData, pdfPath, nil
		}
		return nil, "", fmt.Errorf("pdfPath not found: %s", pdfPath)
	}

	dataURL := strings.TrimSpace(paramStr(params, "pdfDataUrl"))
	if dataURL != "" {
		if idx := strings.Index(dataURL, ","); idx > 0 {
			dataURL = dataURL[idx+1:]
		}
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(dataURL))
		if err != nil {
			return nil, "", fmt.Errorf("invalid pdfDataUrl base64")
		}
		return decoded, "pdfDataUrl", nil
	}

	rawBase64 := strings.TrimSpace(paramStr(params, "pdfBase64"))
	if rawBase64 != "" {
		decoded, err := base64.StdEncoding.DecodeString(rawBase64)
		if err != nil {
			return nil, "", fmt.Errorf("invalid pdfBase64")
		}
		return decoded, "pdfBase64", nil
	}

	return nil, "", fmt.Errorf("missing pdf input: provide pdfPath or pdfDataUrl or pdfBase64")
}

func parsePdfOverlayItems(raw any) []pdfOverlayTextItem {
	arr, ok := raw.([]any)
	if !ok {
		if m, okMap := raw.([]map[string]any); okMap {
			arr = make([]any, 0, len(m))
			for _, v := range m {
				arr = append(arr, v)
			}
		}
	}
	if len(arr) == 0 {
		return nil
	}

	items := make([]pdfOverlayTextItem, 0, len(arr))
	for _, entry := range arr {
		m, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		text := strings.TrimSpace(fmt.Sprint(m["text"]))
		if text == "" {
			continue
		}
		item := pdfOverlayTextItem{
			Page:     paramInt(m, "page", 1),
			Text:     text,
			X:        toFloat(m["x"]),
			Y:        toFloat(m["y"]),
			FontSize: maxInt(6, paramInt(m, "fontSize", 11)),
			FontName: strings.TrimSpace(fmt.Sprint(m["fontName"])),
			Color:    strings.TrimSpace(fmt.Sprint(m["color"])),
			Opacity:  toFloat(m["opacity"]),
			Rotate:   toFloat(m["rotate"]),
		}
		if item.Page <= 0 {
			item.Page = 1
		}
		if item.FontName == "" {
			item.FontName = "Helvetica"
		}
		if item.Color == "" {
			item.Color = "#000000"
		}
		if item.Opacity <= 0 || item.Opacity > 1 {
			item.Opacity = 1
		}
		items = append(items, item)
	}
	return items
}

func buildOverlayWatermark(it pdfOverlayTextItem) (*model.Watermark, error) {
	fontName := sanitizePdfFontName(it.FontName)
	color := sanitizePdfHexColor(it.Color)
	desc := fmt.Sprintf(
		"font:%s, points:%d, pos:bl, off:%.2f %.2f, fillcol:%s, op:%.2f, rot:%.2f",
		fontName,
		it.FontSize,
		it.X,
		it.Y,
		color,
		it.Opacity,
		it.Rotate,
	)
	return api.TextWatermark(it.Text, desc, true, false, types.POINTS)
}

func sanitizePdfFontName(input string) string {
	v := strings.TrimSpace(input)
	if v == "" {
		return "Helvetica"
	}
	allowed := regexp.MustCompile(`[^A-Za-z0-9_\-]`)
	v = allowed.ReplaceAllString(v, "")
	if v == "" {
		return "Helvetica"
	}
	return v
}

func sanitizePdfHexColor(input string) string {
	v := strings.TrimSpace(strings.ToLower(input))
	if matched, _ := regexp.MatchString(`^#[0-9a-f]{6}$`, v); matched {
		return v
	}
	if matched, _ := regexp.MatchString(`^[0-9a-f]{6}$`, v); matched {
		return "#" + v
	}
	return "#000000"
}

func toFloat(v any) float64 {
	switch n := v.(type) {
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
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(n), 64)
		return f
	default:
		return 0
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
