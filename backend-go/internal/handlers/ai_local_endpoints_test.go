package handlers

import (
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"csm_server/backend-go/internal/config"

	"github.com/jung-kurt/gofpdf"
)

const onePixelPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAEElEQVR4nGL6z8AACAAA//8DCQECWLbVUAAAAABJRU5ErkJggg=="

func getResultMap(t *testing.T, respKey any) map[string]any {
	t.Helper()
	m, ok := respKey.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any result, got %T", respKey)
	}
	return m
}

func TestAiLocalScanDryRunContract(t *testing.T) {
	h := NewAiHandler(config.AppConfig{}, nil, nil)
	resp := h.HandleAiLocal("/ai-local/scan-dry-run", map[string]any{
		"message": "scan this",
		"attachments": []any{
			map[string]any{"kind": "image"},
			map[string]any{"kind": "image"},
		},
	})
	resultRaw, ok := resp.Get("result")
	if !ok {
		t.Fatal("missing result")
	}
	result := getResultMap(t, resultRaw)
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("expected success=true, got %#v", result["success"])
	}
	scanner := getResultMap(t, result["scanner"])
	if imageCount, _ := scanner["imageCount"].(int); imageCount != 2 {
		t.Fatalf("expected imageCount=2, got %#v", scanner["imageCount"])
	}
}

func TestAiLocalPlanStoryboardContracts(t *testing.T) {
	h := NewAiHandler(config.AppConfig{}, nil, nil)

	respMedia := h.HandleAiLocal("/ai-local/plan-media-storyboard", map[string]any{
		"message":     "Create a short presenter storyboard",
		"durationSec": 15,
	})
	mediaResult := getResultMap(t, mustGet(t, respMedia, "result"))
	if success, _ := mediaResult["success"].(bool); !success {
		t.Fatalf("expected media storyboard success=true, got %#v", mediaResult["success"])
	}
	if engine, _ := mediaResult["renderEngine"].(string); engine != "talking_presenter" {
		t.Fatalf("unexpected media engine: %v", mediaResult["renderEngine"])
	}
	if scenesLen := sliceLen(mediaResult["scenes"]); scenesLen != 3 {
		t.Fatalf("expected 3 media scenes, got %#v", mediaResult["scenes"])
	}

	respMartial := h.HandleAiLocal("/ai-local/plan-martial-storyboard", map[string]any{
		"message":     "Create martial rooftop storyboard",
		"durationSec": 18,
	})
	martialResult := getResultMap(t, mustGet(t, respMartial, "result"))
	if success, _ := martialResult["success"].(bool); !success {
		t.Fatalf("expected martial storyboard success=true, got %#v", martialResult["success"])
	}
	if engine, _ := martialResult["renderEngine"].(string); engine != "martial_cinematic" {
		t.Fatalf("unexpected martial engine: %v", martialResult["renderEngine"])
	}
	if scenesLen := sliceLen(martialResult["scenes"]); scenesLen != 4 {
		t.Fatalf("expected 4 martial scenes, got %#v", martialResult["scenes"])
	}
}

func TestAiLocalExtractCharacterContract(t *testing.T) {
	h := NewAiHandler(config.AppConfig{}, nil, nil)

	respMissing := h.HandleAiLocal("/ai-local/extract-character", map[string]any{})
	missingResult := getResultMap(t, mustGet(t, respMissing, "result"))
	if success, _ := missingResult["success"].(bool); success {
		t.Fatalf("expected missing attachment success=false, got %#v", missingResult["success"])
	}

	respOK := h.HandleAiLocal("/ai-local/extract-character", map[string]any{
		"attachments": []any{map[string]any{"kind": "image", "mimeType": "image/png", "base64Data": onePixelPNGBase64}},
	})
	okResult := getResultMap(t, mustGet(t, respOK, "result"))
	if success, _ := okResult["success"].(bool); !success {
		t.Fatalf("expected extract success=true, got %#v", okResult["success"])
	}
	if cutoutURL, _ := okResult["cutoutUrl"].(string); cutoutURL == "" {
		t.Fatalf("expected cutoutUrl to be generated, got %#v", okResult["cutoutUrl"])
	}
}

func TestAiLocalRenderMediaContract(t *testing.T) {
	h := NewAiHandler(config.AppConfig{}, nil, nil)

	respMissing := h.HandleAiLocal("/ai-local/render-media-script", map[string]any{})
	missingResult := getResultMap(t, mustGet(t, respMissing, "result"))
	if success, _ := missingResult["success"].(bool); success {
		t.Fatalf("expected missing message success=false, got %#v", missingResult["success"])
	}

	respOK := h.HandleAiLocal("/ai-local/render-media-script", map[string]any{
		"message":     "Render from storyboard",
		"outputMode":  "image",
		"attachments": []any{map[string]any{"kind": "image", "mimeType": "image/png", "base64Data": onePixelPNGBase64}},
	})
	okResult := getResultMap(t, mustGet(t, respOK, "result"))
	if success, _ := okResult["success"].(bool); !success {
		t.Fatalf("expected render success=true, got %#v", okResult["success"])
	}
	if engine, _ := okResult["renderEngine"].(string); engine != "talking_presenter" {
		t.Fatalf("expected default renderEngine=talking_presenter, got %#v", okResult["renderEngine"])
	}
	if mode, _ := okResult["outputMode"].(string); mode != "image" {
		t.Fatalf("expected outputMode=image, got %#v", okResult["outputMode"])
	}
	if imageURL, _ := okResult["imageUrl"].(string); imageURL == "" {
		t.Fatalf("expected generated imageUrl, got %#v", okResult["imageUrl"])
	}
}

func TestAiLocalTemplateReportRenderContract(t *testing.T) {
	dataDir := t.TempDir()
	templateDir := filepath.Join(dataDir, "public", "reports")
	if err := os.MkdirAll(templateDir, 0o755); err != nil {
		t.Fatalf("mkdir template dir failed: %v", err)
	}

	templatePath := filepath.Join(templateDir, "customer-report.json")
	templateJSON := []byte(`{
		"name": "customer-report",
		"title": "BÁO CÁO KHÁCH HÀNG",
		"header": {
			"companyName": "Công ty mẫu",
			"taxNo": "0123456789",
			"address": "Địa chỉ mẫu",
			"website": "example.com"
		},
		"notes": ["Ghi chú mẫu", "Phụ lục đính kèm"],
		"columns": [
			{"title": "STT", "width": 10},
			{"title": "Mục", "width": 90},
			{"title": "Giá trị", "width": 30}
		]
	}`)
	if err := os.WriteFile(templatePath, templateJSON, 0o644); err != nil {
		t.Fatalf("write template failed: %v", err)
	}

	h := NewAiHandler(config.AppConfig{DataDir: dataDir}, nil, nil)
	resp := h.HandleAiLocal("/ai-local/report/render-template", map[string]any{
		"appId":        "csm",
		"templatePath": "reports/customer-report.json",
		"customerCode": "demo",
		"outputName":   "demo-report.pdf",
		"data": map[string]any{
			"reportNo":   "RC-001",
			"reportDate": "14/07/2026",
			"clientName": "Khách hàng demo",
			"items": []any{
				map[string]any{"name": "Dịch vụ A", "value": "100"},
				map[string]any{"name": "Dịch vụ B", "value": "200"},
			},
		},
	})
	result := getResultMap(t, mustGet(t, resp, "result"))
	t.Logf("template render result: %#v", result)
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("expected template render success=true, got %#v", result["success"])
	}
	if pdfPath, _ := result["pdfPath"].(string); pdfPath == "" {
		t.Fatalf("expected pdfPath to be generated, got %#v", result["pdfPath"])
	}
	generated := filepath.Join(dataDir, "public", "app_images", "csm", "demo-report.pdf")
	if _, err := os.Stat(generated); err != nil {
		t.Fatalf("expected generated PDF at %s, stat err=%v", generated, err)
	}
}

func TestAiLocalTemplateReportRenderBase64Contract(t *testing.T) {
	h := NewAiHandler(config.AppConfig{DataDir: t.TempDir()}, nil, nil)
	resp := h.HandleAiLocal("/ai-local/report/render-template", map[string]any{
		"appId":           "csm",
		"templatePath":    "reports/customer-report.json",
		"customerCode":    "demo",
		"saveToDisk":      false,
		"returnBase64":    true,
		"samplePdfBase64": base64.StdEncoding.EncodeToString([]byte("%PDF-1.4\n%sample")),
		"data": map[string]any{
			"reportNo":   "RC-002",
			"reportDate": "15/07/2026",
			"clientName": "Khách hàng tiếng Việt",
			"items": []any{
				map[string]any{"name": "Dịch vụ A", "value": "120"},
				map[string]any{"name": "Dịch vụ B", "value": "240"},
			},
		},
	})
	result := getResultMap(t, mustGet(t, resp, "result"))
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("expected base64 render success=true, got %#v", result["success"])
	}
	if pdfBase64, _ := result["pdfBase64"].(string); pdfBase64 == "" {
		t.Fatalf("expected pdfBase64 to be returned, got %#v", result["pdfBase64"])
	}
	if _, ok := result["pdfPath"]; ok {
		if pdfPath, _ := result["pdfPath"].(string); pdfPath != "" {
			t.Fatalf("expected no disk path when saveToDisk=false, got %#v", pdfPath)
		}
	}
}

func TestAiLocalTemplateRejectsDocxSampleInput(t *testing.T) {
	h := NewAiHandler(config.AppConfig{DataDir: t.TempDir()}, nil, nil)
	resp := h.HandleAiLocal("/ai-local/report/render-template/preview", map[string]any{
		"appId":         "csm",
		"templatePath":  "reports/customer-report.json",
		"samplePdfPath": "app_images/demo/sample.docx",
		"data": map[string]any{
			"reportNo":   "RC-101",
			"reportDate": "14/07/2026",
			"clientName": "Công ty Demo",
		},
	})
	result := getResultMap(t, mustGet(t, resp, "result"))
	if success, _ := result["success"].(bool); success {
		t.Fatalf("expected DOCX sample input to be rejected, got success=true with %#v", result)
	}
	if code, _ := result["errorCode"].(string); code != "SAMPLE_PDF_REQUIRED" {
		t.Fatalf("expected SAMPLE_PDF_REQUIRED error, got %#v", result["errorCode"])
	}
}

func TestAiLocalTemplatePreviewFromSamplePdfContract(t *testing.T) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(12, 12, 12)
	pdf.SetAutoPageBreak(true, 12)
	pdf.AddPage()
	pdf.SetFont("Helvetica", "B", 14)
	pdf.CellFormat(0, 8, "BÁO CÁO MẪU KHÁCH HÀNG", "", 1, "C", false, 0, "")
	pdf.Ln(2)
	pdf.SetFont("Helvetica", "", 10)
	pdf.CellFormat(0, 5, "Mã báo cáo: RC-100", "", 1, "L", false, 0, "")
	pdf.CellFormat(0, 5, "Khách hàng: Công ty Demo", "", 1, "L", false, 0, "")
	pdf.CellFormat(0, 5, "Ngày: 14/07/2026", "", 1, "L", false, 0, "")
	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		t.Fatalf("generate sample pdf failed: %v", err)
	}

	h := NewAiHandler(config.AppConfig{DataDir: t.TempDir()}, nil, nil)
	resp := h.HandleAiLocal("/ai-local/report/render-template/preview", map[string]any{
		"appId":           "csm",
		"templatePath":    "reports/customer-report.json",
		"customerCode":    "demo",
		"saveToDisk":      false,
		"returnBase64":    true,
		"samplePdfBase64": base64.StdEncoding.EncodeToString(buf.Bytes()),
		"data": map[string]any{
			"reportNo":   "RC-100",
			"reportDate": "14/07/2026",
			"clientName": "Công ty Demo",
			"items": []any{
				map[string]any{"name": "Dịch vụ A", "value": "120"},
			},
		},
	})
	result := getResultMap(t, mustGet(t, resp, "result"))
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("expected preview success=true, got %#v", result["success"])
	}
	if previewMode, _ := result["previewMode"].(bool); !previewMode {
		t.Fatalf("expected previewMode=true, got %#v", result["previewMode"])
	}
	if designPlan, _ := result["designPlan"].(map[string]any); designPlan == nil {
		t.Fatalf("expected designPlan to be present, got %#v", result["designPlan"])
	}
	if pdfBase64, _ := result["pdfBase64"].(string); pdfBase64 == "" {
		t.Fatalf("expected preview pdfBase64 to be returned, got %#v", result["pdfBase64"])
	}
	if pdfURL, _ := result["pdfUrl"].(string); pdfURL == "" || pdfURL == "/" {
		t.Fatalf("expected preview pdfUrl to be returned, got %#v", result["pdfUrl"])
	}
}

func TestAiLocalCleanupRenderArtifacts(t *testing.T) {
	dataDir := t.TempDir()
	appID := "csm"
	appDir := filepath.Join(dataDir, "public", "app_images", appID)
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}

	oldFile := filepath.Join(appDir, "ai-render-old.jpg")
	newFile := filepath.Join(appDir, "ai-render-new.jpg")
	nonManaged := filepath.Join(appDir, "keep.txt")
	if err := os.WriteFile(oldFile, []byte("old"), 0o644); err != nil {
		t.Fatalf("write old file failed: %v", err)
	}
	if err := os.WriteFile(newFile, []byte("new"), 0o644); err != nil {
		t.Fatalf("write new file failed: %v", err)
	}
	if err := os.WriteFile(nonManaged, []byte("keep"), 0o644); err != nil {
		t.Fatalf("write keep file failed: %v", err)
	}
	oldTime := time.Now().Add(-48 * time.Hour)
	if err := os.Chtimes(oldFile, oldTime, oldTime); err != nil {
		t.Fatalf("chtimes failed: %v", err)
	}

	h := NewAiHandler(config.AppConfig{DataDir: dataDir}, nil, nil)
	resp := h.HandleAiLocal("/ai-local/cleanup-render-artifacts", map[string]any{
		"appId":    appID,
		"ttlHours": 24,
	})
	result := getResultMap(t, mustGet(t, resp, "result"))
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("expected cleanup success=true, got %#v", result["success"])
	}
	if deleted, _ := result["deletedCount"].(int); deleted < 1 {
		t.Fatalf("expected at least one deleted artifact, got %#v", result["deletedCount"])
	}
	if _, err := os.Stat(oldFile); !os.IsNotExist(err) {
		t.Fatalf("expected old artifact to be deleted, stat err=%v", err)
	}
	if _, err := os.Stat(newFile); err != nil {
		t.Fatalf("expected new artifact to remain, stat err=%v", err)
	}
	if _, err := os.Stat(nonManaged); err != nil {
		t.Fatalf("expected non-managed file to remain, stat err=%v", err)
	}
}

func mustGet(t *testing.T, resp interface{ Get(string) (any, bool) }, key string) any {
	t.Helper()
	v, ok := resp.Get(key)
	if !ok {
		t.Fatalf("missing key %s", key)
	}
	return v
}

func sliceLen(v any) int {
	rv := reflect.ValueOf(v)
	if !rv.IsValid() {
		return 0
	}
	if rv.Kind() != reflect.Slice && rv.Kind() != reflect.Array {
		return 0
	}
	return rv.Len()
}
