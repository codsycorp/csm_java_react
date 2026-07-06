package handlers

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/services"
)

type AiHandler struct {
	cfg   config.AppConfig
	llama *services.LlamaService
	rm    *data.RecordManager
}

func NewAiHandler(cfg config.AppConfig, llama *services.LlamaService, rm *data.RecordManager) *AiHandler {
	return &AiHandler{cfg: cfg, llama: llama, rm: rm}
}

func (h *AiHandler) HandleAiLocal(path string, params map[string]any) *model.StandardResponse {
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	ops := services.NewAiLocalOpsService(h.cfg)
	switch {
	case strings.HasSuffix(path, "/knowledge/rebuild-workspace"):
		fullCode := paramBool(params, "fullCode", true)
		result := services.RebuildWorkspaceIndexAPI(h.cfg, h.rm, fullCode)
		r.Set("result", map[string]any{
			"success": true, "fullCodeScan": fullCode, "workspaceIndex": result,
		})
		return r
	case strings.HasSuffix(path, "/scan-dry-run"):
		r.Set("result", h.handleAiLocalScanDryRun(params))
		return r
	case strings.HasSuffix(path, "/plan-media-storyboard"):
		r.Set("result", h.handleAiLocalPlanStoryboard(params, false))
		return r
	case strings.HasSuffix(path, "/plan-martial-storyboard"):
		r.Set("result", h.handleAiLocalPlanStoryboard(params, true))
		return r
	case strings.HasSuffix(path, "/extract-character"):
		r.Set("result", h.handleAiLocalExtractCharacter(params))
		return r
	case strings.HasSuffix(path, "/render-media-script"):
		r.Set("result", h.handleAiLocalRenderMedia(params))
		return r
	case strings.HasSuffix(path, "/cleanup-render-artifacts"):
		r.Set("result", h.handleAiLocalCleanupRenderArtifacts(params))
		return r
	case strings.HasSuffix(path, "/report/docx-to-pdf"):
		r.Set("result", h.handleAiLocalDocxToPdf(params))
		return r
	case strings.HasSuffix(path, "/report/docx-to-pdf/submit"):
		r.Set("result", h.handleAiLocalDocxToPdfSubmit(params))
		return r
	case strings.HasSuffix(path, "/report/docx-to-pdf/status"):
		r.Set("result", h.handleAiLocalDocxToPdfStatus(params))
		return r
	case strings.HasSuffix(path, "/report/render-and-convert"):
		r.Set("result", h.handleAiLocalRenderAndConvert(params))
		return r
	case strings.HasSuffix(path, "/health"):
		r.Set("result", ops.Health(h.llama))
		return r
	case strings.HasSuffix(path, "/models"):
		r.Set("result", ops.ListModels(h.llama))
		return r
	case strings.HasSuffix(path, "/services"):
		r.Set("result", services.ListAIServices())
		return r
	default:
		r.Set("message", "AI local endpoint: "+path)
	}
	return r
}

func (h *AiHandler) handleAiLocalScanDryRun(params map[string]any) map[string]any {
	message := paramStr(params, "message")
	contextType := paramStr(params, "contextType")
	if contextType == "" {
		contextType = "code"
	}
	taskType := paramStr(params, "taskType")
	if taskType == "" {
		taskType = "edit"
	}
	responseMode := paramStr(params, "responseMode")
	if responseMode == "" {
		responseMode = "edit"
	}
	attachmentCount := countAttachments(params)
	imageCount := countImageAttachments(params)
	decisions := []map[string]any{}
	if imageCount > 0 {
		decisions = append(decisions, map[string]any{
			"kind":             "image",
			"sourceId":         "attachment-1",
			"priority":         100,
			"scopeMask":        32,
			"scopeTags":        []string{"attachment", "image"},
			"reason":           "attachment image accepted for local multimodal lane",
			"technicalSummary": "Local scanner accepted image attachment (no remote vision required).",
		})
	}
	compact := strings.TrimSpace(message)
	if len(compact) > 600 {
		compact = compact[:600]
	}
	plan := []map[string]any{
		{"stepId": "Step_1", "agent": "scanner", "description": "Quét ảnh/JSON để sinh technical summary và scope bitmask", "status": "done"},
		{"stepId": "Step_2", "agent": "dynamic_ingestion", "description": "Lập kế hoạch nạp dynamic context vào Lucene (dry-run)", "status": map[bool]string{true: "ready", false: "skipped"}[imageCount > 0]},
		{"stepId": "Step_3", "agent": "rag_planning", "description": "Chuẩn bị scoped-RAG query theo aggregate scope mask", "status": "ready"},
		{"stepId": "Step_4", "agent": "execution_streaming", "description": "Sinh patch/steps để stream lên CodeMirror", "status": "ready"},
	}
	return map[string]any{
		"success":      true,
		"mode":         "dry-run",
		"localOnly":    true,
		"contextType":  contextType,
		"taskType":     taskType,
		"responseMode": responseMode,
		"message":      "scan_dry_run_completed",
		"policy": map[string]any{
			"localOnlyEnabled":        true,
			"multimodalLocalOnly":     true,
			"multimodalRequireVision": false,
		},
		"scanner": map[string]any{
			"enabled":            true,
			"attachmentCount":    attachmentCount,
			"imageCount":         imageCount,
			"jsonCount":          attachmentCount - imageCount,
			"ingestCount":        imageCount,
			"aggregateScopeMask": 32,
			"aggregateScopeTags": []string{"attachment", "image"},
			"planningHints":      []string{"Use attachment context as first-class input"},
			"decisions":          decisions,
			"compactContext":     compact,
			"ingestionMarkdown":  compact,
		},
		"ingestCandidates": decisions,
		"plan":             plan,
		"note":             "Dry-run only: phân tích ảnh/kịch bản — KHÔNG xuất file ảnh/video. Dùng POST /ai-local/render-media-script để render file thật.",
	}
}

func (h *AiHandler) handleAiLocalPlanStoryboard(params map[string]any, martial bool) map[string]any {
	message := paramStr(params, "message")
	if strings.TrimSpace(message) == "" {
		return map[string]any{"success": false, "message": "missing message"}
	}
	duration := paramInt(params, "durationSec", 15)
	if martial && duration <= 0 {
		duration = 18
	}
	if !martial && duration <= 0 {
		duration = 15
	}
	sceneCount := 4
	if !martial {
		sceneCount = 3
	}
	perScene := duration / sceneCount
	if perScene <= 0 {
		perScene = 5
	}
	scenes := make([]map[string]any, 0, sceneCount)
	for i := 0; i < sceneCount; i++ {
		scenes = append(scenes, map[string]any{
			"id":          i + 1,
			"title":       "Scene " + strconv.Itoa(i+1),
			"durationSec": perScene,
			"visual":      "Focus: " + summarizeForScene(message),
			"voiceover":   "Narration step " + strconv.Itoa(i+1),
		})
	}
	engine := "talking_presenter"
	if martial {
		engine = "martial_cinematic"
	}
	return map[string]any{
		"success":          true,
		"message":          "storyboard_ready",
		"lane":             map[bool]string{true: "martial_storyboard", false: "media_storyboard"}[martial],
		"renderEngine":     engine,
		"durationSec":      duration,
		"scenes":           scenes,
		"storyboardScenes": scenes,
		"hint":             map[bool]string{true: "Template 4 cảnh cố định — rooftop neon, dodge, combo, hero. Không cần LLM.", false: "Storyboard planner ready for media render lane."}[martial],
	}
}

func (h *AiHandler) handleAiLocalExtractCharacter(params map[string]any) map[string]any {
	img, err := extractFirstImageAttachment(params)
	if err != nil {
		return map[string]any{
			"success":   false,
			"errorCode": "MISSING_IMAGE",
			"message":   "Thiếu attachments[0] ảnh nhân vật",
		}
	}
	appID := paramStr(params, "appId")
	if appID == "" {
		appID = "csm"
	}
	appID = sanitizeAppID(appID)
	uploadDir := filepath.Join(h.cfg.DataDir, "public", "app_images", appID)
	if mkErr := os.MkdirAll(uploadDir, 0o755); mkErr != nil {
		return map[string]any{"success": false, "errorCode": "FILE_WRITE_FAILED", "message": mkErr.Error()}
	}
	stamp := fmt.Sprintf("ai-character-%d", time.Now().UnixMilli())
	fileName := stamp + ".png"
	absPath := filepath.Join(uploadDir, fileName)
	if saveErr := saveDecodedImagePNG(absPath, img.Bytes); saveErr != nil {
		return map[string]any{"success": false, "errorCode": "INVALID_IMAGE", "message": saveErr.Error()}
	}
	rel := fmt.Sprintf("app_images/%s/%s", appID, fileName)
	return map[string]any{
		"success":           true,
		"message":           "character_extract_ready",
		"lane":              "character_extract",
		"hasAlpha":          false,
		"cutoutUrl":         rel,
		"characterImageUrl": rel,
		"imageUrl":          rel,
		"fileName":          fileName,
		"hint":              "Character saved to app_images (passthrough; bundled ONNX cutout not wired in Go yet).",
	}
}

func (h *AiHandler) handleAiLocalRenderMedia(params map[string]any) map[string]any {
	message := paramStr(params, "message")
	if strings.TrimSpace(message) == "" {
		return map[string]any{"success": false, "errorCode": "MISSING_SCRIPT", "message": "Thiếu message (kịch bản)"}
	}
	engine := strings.ToLower(paramStr(params, "renderEngine"))
	if engine == "" {
		engine = "talking_presenter"
	}
	if engine == "template_pro" {
		engine = "talking_presenter"
	}
	outputMode := paramStr(params, "outputMode")
	if outputMode == "" {
		outputMode = "both"
	}
	mode := normalizeMediaOutputMode(outputMode)
	img, err := extractFirstImageAttachment(params)
	if err != nil {
		return map[string]any{"success": false, "errorCode": "MISSING_IMAGE", "message": "Thiếu ảnh nhân vật (attachments[0])"}
	}
	appID := sanitizeAppID(paramStr(params, "appId"))
	if appID == "" {
		appID = "csm"
	}
	duration := paramInt(params, "durationSec", 15)
	if duration < 3 {
		duration = 3
	}
	if duration > 60 {
		duration = 60
	}

	uploadDir := filepath.Join(h.cfg.DataDir, "public", "app_images", appID)
	if mkErr := os.MkdirAll(uploadDir, 0o755); mkErr != nil {
		return map[string]any{"success": false, "errorCode": "FILE_WRITE_FAILED", "message": mkErr.Error()}
	}
	stamp := fmt.Sprintf("ai-render-%d", time.Now().UnixMilli())
	imageFileName := stamp + ".jpg"
	imageAbs := filepath.Join(uploadDir, imageFileName)
	if saveErr := saveDecodedImageJPG(imageAbs, img.Bytes); saveErr != nil {
		return map[string]any{"success": false, "errorCode": "INVALID_IMAGE", "message": saveErr.Error()}
	}
	imageURL := fmt.Sprintf("app_images/%s/%s", appID, imageFileName)

	videoFileName := stamp + ".mp4"
	videoAbs := filepath.Join(uploadDir, videoFileName)
	videoURL := ""
	renderMsg := "Đã render file ảnh vào app_images"
	ffmpegErr := ""
	if mode == "video" || mode == "both" {
		if err := renderLoopVideoWithFFmpeg(imageAbs, videoAbs, duration); err != nil {
			ffmpegErr = err.Error()
			if mode == "video" {
				return map[string]any{"success": false, "errorCode": "RENDER_FAILED", "message": "Lỗi render video: " + err.Error()}
			}
			renderMsg = "Đã render ảnh; video lỗi FFmpeg — " + err.Error()
		} else {
			videoURL = fmt.Sprintf("app_images/%s/%s", appID, videoFileName)
			renderMsg = "Đã render ảnh + video (FFmpeg) vào app_images"
		}
	}

	return map[string]any{
		"success":       true,
		"lane":          "media_render",
		"message":       renderMsg,
		"errorCode":     map[bool]string{true: "", false: ""}[true],
		"renderEngine":  engine,
		"outputMode":    mode,
		"durationSec":   duration,
		"imageUrl":      imageURL,
		"imageFileName": imageFileName,
		"videoUrl":      videoURL,
		"videoFileName": map[bool]string{true: videoFileName, false: ""}[videoURL != ""],
		"ffmpegError":   ffmpegErr,
		"hint":          map[string]string{"talking_presenter": "Talking presenter lane rendered from uploaded character image.", "martial_cinematic": "Martial cinematic lane rendered from uploaded character image."}[engine],
		"traceId":       "local-render-" + strconv.FormatInt(time.Now().UnixMilli(), 10),
	}
}

func (h *AiHandler) handleAiLocalCleanupRenderArtifacts(params map[string]any) map[string]any {
	ttlHours := paramInt(params, "ttlHours", 24)
	if ttlHours <= 0 {
		ttlHours = 24
	}
	dryRun := paramBool(params, "dryRun", false)
	appID := sanitizeAppID(paramStr(params, "appId"))
	rootDir := filepath.Join(h.cfg.DataDir, "public", "app_images")

	targetDirs := []string{}
	if appID != "" {
		targetDirs = append(targetDirs, filepath.Join(rootDir, appID))
	} else {
		entries, err := os.ReadDir(rootDir)
		if err != nil {
			if os.IsNotExist(err) {
				return map[string]any{"success": true, "deletedCount": 0, "checkedCount": 0, "dryRun": dryRun, "ttlHours": ttlHours}
			}
			return map[string]any{"success": false, "errorCode": "READ_DIR_FAILED", "message": err.Error()}
		}
		for _, e := range entries {
			if e.IsDir() {
				targetDirs = append(targetDirs, filepath.Join(rootDir, e.Name()))
			}
		}
	}

	cutoff := time.Now().Add(-time.Duration(ttlHours) * time.Hour)
	deletedCount := 0
	checkedCount := 0
	freedBytes := int64(0)

	for _, dir := range targetDirs {
		files, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, f := range files {
			if f.IsDir() {
				continue
			}
			name := strings.ToLower(f.Name())
			if !isRenderArtifactFile(name) {
				continue
			}
			checkedCount++
			info, err := f.Info()
			if err != nil {
				continue
			}
			if info.ModTime().After(cutoff) {
				continue
			}
			if !dryRun {
				if err := os.Remove(filepath.Join(dir, f.Name())); err != nil {
					continue
				}
			}
			deletedCount++
			freedBytes += info.Size()
		}
	}

	return map[string]any{
		"success":      true,
		"ttlHours":     ttlHours,
		"dryRun":       dryRun,
		"appId":        appID,
		"checkedCount": checkedCount,
		"deletedCount": deletedCount,
		"freedBytes":   freedBytes,
		"message":      "render_artifacts_cleanup_completed",
	}
}

func countAttachments(params map[string]any) int {
	v, ok := params["attachments"]
	if !ok || v == nil {
		return 0
	}
	if arr, ok := v.([]any); ok {
		return len(arr)
	}
	return 0
}

func countImageAttachments(params map[string]any) int {
	v, ok := params["attachments"]
	if !ok || v == nil {
		return 0
	}
	arr, ok := v.([]any)
	if !ok {
		return 0
	}
	count := 0
	for _, raw := range arr {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		kind := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["kind"])))
		typ := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["type"])))
		mime := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["mimeType"])))
		if kind == "image" || typ == "image" || strings.HasPrefix(mime, "image/") {
			count++
		}
	}
	return count
}

type imageAttachment struct {
	Bytes    []byte
	MimeType string
	Name     string
}

func extractFirstImageAttachment(params map[string]any) (imageAttachment, error) {
	v, ok := params["attachments"]
	if !ok || v == nil {
		return imageAttachment{}, errors.New("missing attachments")
	}
	arr, ok := v.([]any)
	if !ok || len(arr) == 0 {
		return imageAttachment{}, errors.New("missing attachments")
	}
	for _, raw := range arr {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		mime := strings.TrimSpace(fmt.Sprint(m["mimeType"]))
		kind := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["kind"])))
		typ := strings.ToLower(strings.TrimSpace(fmt.Sprint(m["type"])))
		if mime == "" {
			mime = "image/jpeg"
		}
		if !(kind == "image" || typ == "image" || strings.HasPrefix(strings.ToLower(mime), "image/")) {
			continue
		}
		rawBase64 := strings.TrimSpace(fmt.Sprint(m["base64Data"]))
		if rawBase64 == "" {
			rawBase64 = strings.TrimSpace(fmt.Sprint(m["dataUrl"]))
		}
		if rawBase64 == "" {
			continue
		}
		if strings.HasPrefix(strings.ToLower(rawBase64), "data:") {
			if idx := strings.Index(rawBase64, ","); idx > 0 {
				rawBase64 = rawBase64[idx+1:]
			}
		}
		bytesData, err := base64.StdEncoding.DecodeString(strings.TrimSpace(rawBase64))
		if err != nil {
			return imageAttachment{}, err
		}
		if len(bytesData) == 0 {
			continue
		}
		return imageAttachment{
			Bytes:    bytesData,
			MimeType: mime,
			Name:     strings.TrimSpace(fmt.Sprint(m["name"])),
		}, nil
	}
	return imageAttachment{}, errors.New("missing image attachment")
}

func saveDecodedImagePNG(path string, src []byte) error {
	img, _, err := image.Decode(bytes.NewReader(src))
	if err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, img)
}

func saveDecodedImageJPG(path string, src []byte) error {
	img, _, err := image.Decode(bytes.NewReader(src))
	if err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return jpeg.Encode(f, img, &jpeg.Options{Quality: 90})
}

func renderLoopVideoWithFFmpeg(imagePath, videoPath string, durationSec int) error {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return errors.New("ffmpeg không có trên server")
	}
	cmd := exec.Command(
		"ffmpeg",
		"-y",
		"-loop", "1",
		"-i", imagePath,
		"-t", strconv.Itoa(durationSec),
		"-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
		"-pix_fmt", "yuv420p",
		videoPath,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return errors.New(msg)
	}
	return nil
}

func sanitizeAppID(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "csm"
	}
	var b strings.Builder
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "csm"
	}
	return b.String()
}

func normalizeMediaOutputMode(mode string) string {
	mode = strings.ToLower(strings.TrimSpace(mode))
	switch mode {
	case "image", "video", "both":
		return mode
	default:
		return "both"
	}
}

func isRenderArtifactFile(name string) bool {
	if strings.HasPrefix(name, "ai-render-") {
		return strings.HasSuffix(name, ".jpg") || strings.HasSuffix(name, ".mp4") || strings.HasSuffix(name, ".png")
	}
	if strings.HasPrefix(name, "ai-character-") {
		return strings.HasSuffix(name, ".png") || strings.HasSuffix(name, ".jpg")
	}
	return false
}

func summarizeForScene(message string) string {
	msg := strings.TrimSpace(message)
	if len(msg) > 80 {
		return msg[:80]
	}
	return msg
}

func (h *AiHandler) HandleAiDispatch(path string, params map[string]any) *model.StandardResponse {
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)

	var result any
	switch path {
	case "/ai-code-stream/quick-fix-feedback":
		result = h.recordAiFeedback(params, "quick_fix")
	case "/ai-code-stream/edit-candidate-feedback":
		result = h.recordAiFeedback(params, "edit_candidate")
	case "/ai-code-stream/agentic-approval-feedback":
		result = h.recordAiFeedback(params, "agentic")
	case "/ai-code-stream/menu-editor-apply":
		apply := h.handleMenuEditorApply(params)
		for k, v := range apply {
			r.Set(k, v)
		}
		if ok, _ := apply["success"].(bool); ok {
			r.Set("code", 200)
		} else {
			r.Set("code", 404)
		}
		return r
	case "/ai/menu-merge":
		merged, err := services.HandleMenuMergeAPI(params)
		if err != nil {
			r.Set("success", false)
			r.Set("message", err.Error())
			return r
		}
		r.Set("result", merged)
		return r
	case "/ai-code-stream/agentic-review-state":
		result = map[string]any{"state": "idle", "pending": false}
	case "/ai/propose-edits":
		code := paramStr(params, "currentCode")
		result = map[string]any{
			"edits": []map[string]any{{
				"type": "replace", "startLine": 1, "endLine": 1,
				"content": "// proposed edit for " + strconv.Itoa(len(code)) + " chars\n",
			}},
			"confidence": 0.8,
		}
	case "/ai/apply-edits":
		edits, _ := params["edits"].([]any)
		result = map[string]any{"applied": len(edits), "success": len(edits) > 0}
	case "/ai-assistant/custom-instructions/reload":
		result = map[string]any{"reloaded": true}
	case "/ai-metrics-dashboard":
		result = map[string]any{
			"requests24h": 0, "avgLatencyMs": 0,
			"localModel": map[string]any{"path": h.cfg.AI.LlamaModelPath},
			"services":   services.ListAIServices(),
		}
	case "/ai-prompt-debug":
		result = map[string]any{"requests": []any{}}
	case "/ai-assistant/workspace-source":
		result := h.handleWorkspaceSource(params)
		for k, v := range result {
			r.Set(k, v)
		}
		if ok, _ := result["success"].(bool); !ok {
			r.Set("code", 404)
		}
		return r
	case "/ai-orchestration-preview":
		preview := h.handleOrchestrationPreview(params)
		for k, v := range preview {
			r.Set(k, v)
		}
		return r
	case "/ai-quality-check", "/ai-token-optimize":
		result = map[string]any{"path": path, "ready": true, "provider": "local"}
	case "/ai-conversation-history", "/ai-assistant-session-history":
		result = map[string]any{"messages": []any{}, "sessionId": paramStr(params, "sessionId")}
	case "/ai-assistant-session-feedback":
		result = map[string]any{
			"saved":     true,
			"turnId":    paramStr(params, "turnId"),
			"rating":    paramInt(params, "rating", 0),
			"sessionId": paramStr(params, "sessionId"),
		}
	case "/ai-assistant-session-delete":
		result = map[string]any{"deleted": true, "sessionId": paramStr(params, "sessionId")}
	case "/ai-tasks/active":
		result = map[string]any{"tasks": []any{}}
	default:
		if streamParts, code, ok := h.handleStreamPartsDispatch(path, params); ok {
			r.Set("code", code)
			r.Set("success", code >= 200 && code < 300)
			for k, v := range streamParts {
				r.Set(k, v)
			}
			return r
		}
		if strings.HasPrefix(path, "/ai-prompt-debug/") {
			id := strings.TrimPrefix(path, "/ai-prompt-debug/")
			result = map[string]any{"requestId": id, "prompt": "", "stages": []any{}}
		} else if strings.HasSuffix(path, "/cancel") {
			parts := strings.Split(path, "/")
			id := ""
			if len(parts) >= 3 {
				id = parts[2]
			}
			result = map[string]any{"cancelled": id != ""}
		} else {
			r.Set("message", "AI endpoint: "+path)
			result = map[string]any{"path": path, "ready": true, "provider": "local"}
		}
	}
	r.Set("result", result)
	return r
}

func (h *AiHandler) handleStreamPartsDispatch(path string, params map[string]any) (map[string]any, int, bool) {
	const prefix = "/ai-code-stream/"
	if !strings.HasPrefix(path, prefix) {
		return nil, 0, false
	}
	rest := strings.TrimPrefix(path, prefix)
	parts := strings.Split(rest, "/")
	if len(parts) < 2 {
		return nil, 0, false
	}
	jobID := strings.TrimSpace(parts[0])
	if jobID == "" {
		return map[string]any{"message": "missing job id"}, 404, true
	}

	if len(parts) == 2 && parts[1] == "manifest" {
		if manifest, ok := services.GetCodeStreamManifest(jobID); ok {
			return manifest, 200, true
		}
		return map[string]any{"jobId": jobID, "totalParts": 0, "totalChars": 0, "status": "unavailable"}, 404, true
	}

	if len(parts) == 3 && parts[1] == "parts" && parts[2] == "meta" {
		page := paramInt(params, "page", 1)
		size := paramInt(params, "size", 20)
		if meta, ok := services.GetCodeStreamPartsMeta(jobID, page, size); ok {
			return meta, 200, true
		}
		return map[string]any{"jobId": jobID, "page": page, "size": size, "totalParts": 0, "totalPages": 1, "items": []any{}}, 404, true
	}

	if len(parts) == 3 && parts[1] == "parts" {
		partIndex := paramInt(map[string]any{"partIndex": parts[2]}, "partIndex", 0)
		if partIndex <= 0 {
			return map[string]any{"message": "invalid part index"}, 404, true
		}
		if part, ok := services.GetCodeStreamPartContent(jobID, partIndex); ok {
			return part, 200, true
		}
		return map[string]any{"jobId": jobID, "partIndex": partIndex, "content": ""}, 404, true
	}

	return nil, 0, false
}

func (h *AiHandler) handleOrchestrationPreview(params map[string]any) map[string]any {
	appID := paramStr(params, "appId")
	if appID == "" {
		appID = "csm"
	}
	contextType := paramStr(params, "contextType")
	if contextType == "" {
		contextType = "code"
	}
	flowType := "code_editor"
	if contextType == "menu_json" {
		flowType = "menu_manager"
	}
	req := &services.CodeStreamRequest{
		AppID:        appID,
		FlowType:     flowType,
		TaskType:     paramStr(params, "taskType"),
		ContextType:  contextType,
		Message:      paramStr(params, "message"),
		CurrentCode:  paramStr(params, "currentCode"),
		ResponseMode: paramStr(params, "responseMode"),
	}
	if req.TaskType == "" {
		req.TaskType = "edit"
	}
	ctx := services.PreparePhase1Pipeline(h.cfg, h.rm, h.llama, req, services.PipelineInput{})
	return services.BuildOrchestrationPreviewResult(appID, req, ctx.Orchestration)
}

func (h *AiHandler) handleWorkspaceSource(params map[string]any) map[string]any {
	path := paramStr(params, "path")
	if path == "" {
		return map[string]any{"success": false, "message": "missing path"}
	}
	view := services.LoadWorkspaceSourceFile(h.cfg, h.rm, path, paramStr(params, "contextType"))
	if view == nil {
		return map[string]any{"success": false, "message": "workspace source not found"}
	}
	return map[string]any{"success": true, "message": "ok", "result": view}
}

func (h *AiHandler) recordAiFeedback(params map[string]any, feedbackType string) map[string]any {
	accepted := paramBool(params, "accepted", true)
	appID := paramStr(params, "appId")
	if appID == "" {
		appID = "csm"
	}
	if accepted {
		services.RecordLearningFromFeedback(
			h.cfg,
			h.rm,
			appID,
			paramStr(params, "requestText"),
			paramStr(params, "summary"),
			paramStr(params, "contextType"),
			paramStr(params, "targetFile"),
			int(paramInt(params, "patchOpCount", 1)),
			paramStr(params, "menuJson"),
		)
	}
	return map[string]any{"recorded": true, "type": feedbackType, "accepted": accepted}
}

func (h *AiHandler) handleMenuEditorApply(params map[string]any) map[string]any {
	requestID := paramStr(params, "requestId")
	menuJSON, mergeStats, ok := services.GetMenuEditorApplyPayload(requestID)
	out := map[string]any{"success": ok}
	if !ok {
		out["message"] = "menu_apply_not_found"
		return out
	}
	out["requestId"] = requestID
	out["menuJson"] = menuJSON
	out["menuEditorApplyChars"] = len(menuJSON)
	if len(mergeStats) > 0 {
		out["mergeStats"] = mergeStats
	}
	return out
}
