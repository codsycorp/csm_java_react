package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	maxDocxInputBytes = 20 * 1024 * 1024
)

type reportConvertJob struct {
	JobID         string         `json:"jobId"`
	Status        string         `json:"status"`
	CreatedAtUtc  string         `json:"createdAtUtc"`
	UpdatedAtUtc  string         `json:"updatedAtUtc"`
	StartedAtUtc  string         `json:"startedAtUtc,omitempty"`
	FinishedAtUtc string         `json:"finishedAtUtc,omitempty"`
	ErrorCode     string         `json:"errorCode,omitempty"`
	ErrorMessage  string         `json:"errorMessage,omitempty"`
	Result        map[string]any `json:"result,omitempty"`
}

var reportConvertQueue = struct {
	sync.RWMutex
	jobs map[string]*reportConvertJob
}{jobs: map[string]*reportConvertJob{}}

func (h *AiHandler) handleAiLocalDocxToPdf(params map[string]any) map[string]any {
	return h.convertDocxToPdfInternal(params)
}

func (h *AiHandler) handleAiLocalDocxToPdfSubmit(params map[string]any) map[string]any {
	jobID := strings.TrimSpace(paramStr(params, "jobId"))
	if jobID == "" {
		jobID = fmt.Sprintf("docxpdfq-%d", time.Now().UnixMilli())
	}
	now := time.Now().UTC().Format(time.RFC3339)
	job := &reportConvertJob{
		JobID:        jobID,
		Status:       "queued",
		CreatedAtUtc: now,
		UpdatedAtUtc: now,
	}

	reportConvertQueue.Lock()
	reportConvertQueue.jobs[jobID] = job
	reportConvertQueue.Unlock()

	jobParams := cloneMapAny(params)
	go func() {
		reportConvertQueue.Lock()
		if current := reportConvertQueue.jobs[jobID]; current != nil {
			current.Status = "running"
			current.StartedAtUtc = time.Now().UTC().Format(time.RFC3339)
			current.UpdatedAtUtc = current.StartedAtUtc
		}
		reportConvertQueue.Unlock()

		res := h.convertDocxToPdfInternal(jobParams)
		success := paramBool(res, "success", false)

		reportConvertQueue.Lock()
		if current := reportConvertQueue.jobs[jobID]; current != nil {
			current.UpdatedAtUtc = time.Now().UTC().Format(time.RFC3339)
			current.FinishedAtUtc = current.UpdatedAtUtc
			if success {
				current.Status = "done"
				current.Result = res
				current.ErrorCode = ""
				current.ErrorMessage = ""
			} else {
				current.Status = "failed"
				current.Result = nil
				current.ErrorCode = strings.TrimSpace(fmt.Sprint(res["errorCode"]))
				current.ErrorMessage = strings.TrimSpace(fmt.Sprint(res["message"]))
			}
		}
		reportConvertQueue.Unlock()
	}()

	return map[string]any{
		"success": true,
		"jobId":   jobID,
		"status":  "queued",
	}
}

func (h *AiHandler) handleAiLocalDocxToPdfStatus(params map[string]any) map[string]any {
	jobID := strings.TrimSpace(paramStr(params, "jobId"))
	if jobID == "" {
		return map[string]any{"success": false, "errorCode": "JOB_ID_REQUIRED", "message": "missing jobId"}
	}
	reportConvertQueue.RLock()
	job := reportConvertQueue.jobs[jobID]
	reportConvertQueue.RUnlock()
	if job == nil {
		return map[string]any{"success": false, "errorCode": "JOB_NOT_FOUND", "message": "job not found", "jobId": jobID}
	}
	out := map[string]any{
		"success":       true,
		"jobId":         job.JobID,
		"status":        job.Status,
		"createdAtUtc":  job.CreatedAtUtc,
		"updatedAtUtc":  job.UpdatedAtUtc,
		"startedAtUtc":  job.StartedAtUtc,
		"finishedAtUtc": job.FinishedAtUtc,
	}
	if job.ErrorCode != "" {
		out["errorCode"] = job.ErrorCode
	}
	if job.ErrorMessage != "" {
		out["message"] = job.ErrorMessage
	}
	if job.Result != nil {
		out["result"] = job.Result
	}
	return out
}

func (h *AiHandler) handleAiLocalRenderAndConvert(params map[string]any) map[string]any {
	templateBytes, src, err := h.resolveDocxInput(params)
	if err != nil {
		return map[string]any{"success": false, "errorCode": "DOCX_INPUT_INVALID", "message": err.Error()}
	}
	if !looksLikeDocxZip(templateBytes) {
		return map[string]any{"success": false, "errorCode": "DOCX_NOT_ZIP", "message": "template is not a valid DOCX"}
	}

	dataMap := toMapAny(params["data"])
	rendered, err := renderDocxWithData(templateBytes, dataMap)
	if err != nil {
		return map[string]any{"success": false, "errorCode": "DOCX_RENDER_FAILED", "message": err.Error()}
	}

	nextParams := cloneMapAny(params)
	nextParams["docxBase64"] = base64.StdEncoding.EncodeToString(rendered)
	if strings.TrimSpace(paramStr(nextParams, "outputName")) == "" {
		nextParams["outputName"] = fmt.Sprintf("rendered_%d.pdf", time.Now().UnixMilli())
	}
	res := h.convertDocxToPdfInternal(nextParams)
	if paramBool(res, "success", false) {
		res["renderSource"] = src
		res["renderMode"] = "go-docx-token-replace"
	}
	return res
}

func (h *AiHandler) convertDocxToPdfInternal(params map[string]any) map[string]any {
	appID := sanitizeAppID(paramStr(params, "appId"))
	if appID == "" {
		appID = "csm"
	}

	docxBytes, srcHint, err := h.resolveDocxInput(params)
	if err != nil {
		return map[string]any{"success": false, "errorCode": "DOCX_INPUT_INVALID", "message": err.Error()}
	}
	if len(docxBytes) == 0 {
		return map[string]any{"success": false, "errorCode": "DOCX_INPUT_EMPTY", "message": "docx input is empty"}
	}
	if len(docxBytes) > maxDocxInputBytes {
		return map[string]any{
			"success":   false,
			"errorCode": "DOCX_INPUT_TOO_LARGE",
			"message":   fmt.Sprintf("docx too large (%d bytes, max %d)", len(docxBytes), maxDocxInputBytes),
		}
	}
	if !looksLikeDocxZip(docxBytes) {
		return map[string]any{"success": false, "errorCode": "DOCX_NOT_ZIP", "message": "input is not a valid DOCX (zip signature missing)"}
	}

	sofficeBin, err := findSofficeBinary()
	if err != nil {
		return map[string]any{"success": false, "errorCode": "SOFFICE_NOT_FOUND", "message": err.Error()}
	}

	tmpRoot := filepath.Join(h.cfg.NativeDataDir, "tmp", "report_pdf_convert")
	if mkErr := os.MkdirAll(tmpRoot, 0o755); mkErr != nil {
		return map[string]any{"success": false, "errorCode": "TMP_DIR_CREATE_FAILED", "message": mkErr.Error()}
	}

	jobID := fmt.Sprintf("docxpdf-%d", time.Now().UnixMilli())
	workDir, err := os.MkdirTemp(tmpRoot, jobID+"-")
	if err != nil {
		return map[string]any{"success": false, "errorCode": "TMP_WORKDIR_FAILED", "message": err.Error()}
	}
	defer os.RemoveAll(workDir)

	inputDocx := filepath.Join(workDir, "input.docx")
	if err := os.WriteFile(inputDocx, docxBytes, 0o644); err != nil {
		return map[string]any{"success": false, "errorCode": "DOCX_WRITE_FAILED", "message": err.Error()}
	}

	timeoutSec := paramInt(params, "timeoutSec", 90)
	if timeoutSec <= 0 {
		timeoutSec = 90
	}
	if timeoutSec > 300 {
		timeoutSec = 300
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()

	profileDir := filepath.Join(workDir, "lo_profile")
	if mkErr := os.MkdirAll(profileDir, 0o755); mkErr != nil {
		return map[string]any{"success": false, "errorCode": "PROFILE_DIR_FAILED", "message": mkErr.Error()}
	}
	profileURL := "file://" + filepath.ToSlash(profileDir)

	cmd := exec.CommandContext(
		ctx,
		sofficeBin,
		"--headless",
		"--nologo",
		"--nolockcheck",
		"--nodefault",
		"--nofirststartwizard",
		"--norestore",
		"-env:UserInstallation="+profileURL,
		"--convert-to", "pdf:writer_pdf_Export",
		"--outdir", workDir,
		inputDocx,
	)
	combined, runErr := cmd.CombinedOutput()
	if runErr != nil {
		msg := strings.TrimSpace(string(combined))
		if msg == "" {
			msg = runErr.Error()
		}
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return map[string]any{"success": false, "errorCode": "PDF_CONVERT_TIMEOUT", "message": msg}
		}
		return map[string]any{"success": false, "errorCode": "PDF_CONVERT_FAILED", "message": msg}
	}

	generatedPdf := filepath.Join(workDir, "input.pdf")
	if _, statErr := os.Stat(generatedPdf); statErr != nil {
		entries, _ := filepath.Glob(filepath.Join(workDir, "*.pdf"))
		if len(entries) == 0 {
			return map[string]any{
				"success":   false,
				"errorCode": "PDF_NOT_FOUND",
				"message":   "soffice completed but no PDF output found",
			}
		}
		generatedPdf = entries[0]
	}

	pdfBytes, err := os.ReadFile(generatedPdf)
	if err != nil {
		return map[string]any{"success": false, "errorCode": "PDF_READ_FAILED", "message": err.Error()}
	}

	publicDir := filepath.Join(h.cfg.DataDir, "public", "app_images", appID)
	if err := os.MkdirAll(publicDir, 0o755); err != nil {
		return map[string]any{"success": false, "errorCode": "PDF_PUBLIC_DIR_FAILED", "message": err.Error()}
	}

	outputName := sanitizePdfOutputName(paramStr(params, "outputName"))
	if outputName == "" {
		outputName = fmt.Sprintf("report_%d.pdf", time.Now().UnixMilli())
	}
	outputAbs := filepath.Join(publicDir, outputName)
	if err := os.WriteFile(outputAbs, pdfBytes, 0o644); err != nil {
		return map[string]any{"success": false, "errorCode": "PDF_SAVE_FAILED", "message": err.Error()}
	}

	relPath := fmt.Sprintf("app_images/%s/%s", appID, outputName)
	result := map[string]any{
		"success":        true,
		"message":        "docx_to_pdf_done",
		"source":         srcHint,
		"converter":      "libreoffice",
		"sofficeBin":     sofficeBin,
		"jobId":          jobID,
		"pdfPath":        relPath,
		"pdfUrl":         "/" + relPath,
		"pdfSize":        len(pdfBytes),
		"timeoutSec":     timeoutSec,
		"convertedAtUtc": time.Now().UTC().Format(time.RFC3339),
	}
	if paramBool(params, "returnBase64", false) {
		result["pdfBase64"] = base64.StdEncoding.EncodeToString(pdfBytes)
	}
	return result
}

func (h *AiHandler) resolveDocxInput(params map[string]any) ([]byte, string, error) {
	docxPath := normalizeDocxSourcePath(paramStr(params, "docxPath"))
	if docxPath != "" {
		if !isAllowedDocxSourcePath(docxPath) {
			return nil, "", errors.New("docxPath must be under app_images/ or reports/")
		}
		if p := h.rm.GetStaticFile(docxPath); p != "" {
			bytesData, err := os.ReadFile(p)
			if err == nil {
				return bytesData, docxPath, nil
			}
		}
		publicFallback := filepath.Join(h.cfg.DataDir, "public", filepath.FromSlash(docxPath))
		if bytesData, err := os.ReadFile(publicFallback); err == nil {
			return bytesData, docxPath, nil
		}
		return nil, "", errors.New("docxPath not found: " + docxPath)
	}

	dataURL := strings.TrimSpace(paramStr(params, "docxDataUrl"))
	if dataURL != "" {
		if idx := strings.Index(dataURL, ","); idx > 0 {
			dataURL = dataURL[idx+1:]
		}
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(dataURL))
		if err != nil {
			return nil, "", errors.New("invalid docxDataUrl base64")
		}
		return decoded, "docxDataUrl", nil
	}

	rawBase64 := strings.TrimSpace(paramStr(params, "docxBase64"))
	if rawBase64 != "" {
		decoded, err := base64.StdEncoding.DecodeString(rawBase64)
		if err != nil {
			return nil, "", errors.New("invalid docxBase64")
		}
		return decoded, "docxBase64", nil
	}

	return nil, "", errors.New("missing input: provide docxPath or docxDataUrl or docxBase64")
}

func normalizeDocxSourcePath(raw string) string {
	p := strings.TrimSpace(raw)
	if p == "" {
		return ""
	}
	p = strings.TrimPrefix(p, "/api/")
	p = strings.TrimPrefix(p, "/")
	p = filepath.ToSlash(p)
	return p
}

func isAllowedDocxSourcePath(p string) bool {
	if strings.Contains(p, "..") {
		return false
	}
	lower := strings.ToLower(strings.TrimSpace(p))
	if !(strings.HasSuffix(lower, ".docx") || strings.HasSuffix(lower, ".doc")) {
		return false
	}
	return strings.HasPrefix(lower, "app_images/") || strings.HasPrefix(lower, "reports/")
}

func looksLikeDocxZip(b []byte) bool {
	if len(b) < 4 {
		return false
	}
	if b[0] != 0x50 || b[1] != 0x4b {
		return false
	}
	if b[2] == 0x03 && b[3] == 0x04 {
		return true
	}
	if b[2] == 0x05 && b[3] == 0x06 {
		return true
	}
	if b[2] == 0x07 && b[3] == 0x08 {
		return true
	}
	return false
}

func findSofficeBinary() (string, error) {
	if forced := strings.TrimSpace(os.Getenv("AI_LOCAL_SOFFICE_BIN")); forced != "" {
		if p, err := exec.LookPath(forced); err == nil {
			return p, nil
		}
		if _, err := os.Stat(forced); err == nil {
			return forced, nil
		}
	}
	for _, name := range []string{"soffice", "libreoffice"} {
		if p, err := exec.LookPath(name); err == nil {
			return p, nil
		}
	}
	return "", errors.New("cannot find LibreOffice binary (set AI_LOCAL_SOFFICE_BIN or install soffice)")
}

func sanitizePdfOutputName(raw string) string {
	name := strings.TrimSpace(raw)
	if name == "" {
		return ""
	}
	name = strings.ReplaceAll(name, "\\", "/")
	if idx := strings.LastIndex(name, "/"); idx >= 0 {
		name = name[idx+1:]
	}
	var b strings.Builder
	lastDash := false
	for _, c := range name {
		ok := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '-' || c == '_'
		if ok {
			b.WriteRune(c)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteRune('-')
			lastDash = true
		}
	}
	clean := strings.Trim(strings.TrimSpace(b.String()), "-._")
	if clean == "" {
		return ""
	}
	if !strings.HasSuffix(strings.ToLower(clean), ".pdf") {
		clean += ".pdf"
	}
	return clean
}

func cloneMapAny(src map[string]any) map[string]any {
	if src == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

func toMapAny(v any) map[string]any {
	if v == nil {
		return map[string]any{}
	}
	if m, ok := v.(map[string]any); ok {
		return m
	}
	if m, ok := v.(map[string]string); ok {
		out := make(map[string]any, len(m))
		for k, s := range m {
			out[k] = s
		}
		return out
	}
	return map[string]any{}
}

func renderDocxWithData(docx []byte, data map[string]any) ([]byte, error) {
	zr, err := zip.NewReader(bytes.NewReader(docx), int64(len(docx)))
	if err != nil {
		return nil, err
	}
	buf := &bytes.Buffer{}
	zw := zip.NewWriter(buf)

	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			_ = zw.Close()
			return nil, err
		}
		body, readErr := io.ReadAll(rc)
		_ = rc.Close()
		if readErr != nil {
			_ = zw.Close()
			return nil, readErr
		}

		if f.Name == "word/document.xml" {
			rendered := renderDocumentXML(string(body), data)
			body = []byte(rendered)
		}

		hdr := f.FileHeader
		hdr.Method = zip.Deflate
		w, err := zw.CreateHeader(&hdr)
		if err != nil {
			_ = zw.Close()
			return nil, err
		}
		if _, err := w.Write(body); err != nil {
			_ = zw.Close()
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

var loopPattern = regexp.MustCompile(`(?s)\{#([a-zA-Z0-9_\.]+)\}(.*?)\{/([a-zA-Z0-9_\.]+)\}`)
var tokenPattern = regexp.MustCompile(`\{([a-zA-Z0-9_\.]+)\}`)

func renderDocumentXML(xml string, data map[string]any) string {
	out := xml
	for i := 0; i < 12; i++ {
		prev := out
		out = loopPattern.ReplaceAllStringFunc(out, func(block string) string {
			parts := loopPattern.FindStringSubmatch(block)
			if len(parts) < 4 {
				return block
			}
			if parts[1] != parts[3] {
				return block
			}
			listAny := resolvePath(data, parts[1])
			arr, ok := listAny.([]any)
			if !ok {
				if arrMap, ok2 := listAny.([]map[string]any); ok2 {
					arr = make([]any, 0, len(arrMap))
					for _, it := range arrMap {
						arr = append(arr, it)
					}
				} else {
					return ""
				}
			}
			itemTpl := parts[2]
			var b strings.Builder
			for idx, rawItem := range arr {
				itemMap := toMapAny(rawItem)
				if len(itemMap) == 0 {
					if m, ok := rawItem.(map[string]any); ok {
						itemMap = m
					}
				}
				itemMap["index"] = idx + 1
				b.WriteString(tokenPattern.ReplaceAllStringFunc(itemTpl, func(token string) string {
					m := tokenPattern.FindStringSubmatch(token)
					if len(m) < 2 {
						return token
					}
					if v := resolvePath(itemMap, m[1]); v != nil {
						return xmlEscapeText(fmt.Sprint(v))
					}
					if v := resolvePath(data, m[1]); v != nil {
						return xmlEscapeText(fmt.Sprint(v))
					}
					return ""
				}))
			}
			return b.String()
		})
		if out == prev {
			break
		}
	}

	out = tokenPattern.ReplaceAllStringFunc(out, func(token string) string {
		m := tokenPattern.FindStringSubmatch(token)
		if len(m) < 2 {
			return token
		}
		if v := resolvePath(data, m[1]); v != nil {
			return xmlEscapeText(fmt.Sprint(v))
		}
		return ""
	})
	return out
}

func resolvePath(data map[string]any, path string) any {
	if data == nil {
		return nil
	}
	parts := strings.Split(strings.TrimSpace(path), ".")
	if len(parts) == 0 {
		return nil
	}
	var current any = data
	for _, p := range parts {
		key := strings.TrimSpace(p)
		if key == "" {
			continue
		}
		switch node := current.(type) {
		case map[string]any:
			current = node[key]
		case map[string]string:
			current = node[key]
		case []any:
			idx, err := strconv.Atoi(key)
			if err != nil || idx < 0 || idx >= len(node) {
				return nil
			}
			current = node[idx]
		default:
			return nil
		}
	}
	return current
}

func xmlEscapeText(text string) string {
	return strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&apos;",
	).Replace(text)
}
