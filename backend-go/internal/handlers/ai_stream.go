package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/services"
)

type StreamDeps struct {
	Config config.AppConfig
	Llama  *services.LlamaService
	RM     *data.RecordManager
}

func HandleStreamingAPI(deps StreamDeps, w http.ResponseWriter, r *http.Request, path string, params map[string]any, auth *security.AuthUser) bool {
	switch path {
	case "/ai-code-stream":
		handleCodeStream(deps, w, params, auth)
		return true
	case "/aiAssistant-chat-stream":
		handleAssistantChatStream(deps, w, params, auth)
		return true
	case "/ai-local/execute-local-plan":
		handleExecuteLocalPlan(deps, w, params)
		return true
	}
	return false
}

func handleCodeStream(deps StreamDeps, w http.ResponseWriter, params map[string]any, auth *security.AuthUser) {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	if auth == nil {
		writeSSE(w, map[string]any{
			"stage": "blocked", "reason_code": "authentication_required",
			"message": uiText("vi", "Phiên đăng nhập hết hạn.", "Session expired.", "会话已过期。"),
		})
		return
	}

	req, errCode := services.ParseCodeStreamRequest(params, auth.AppID, auth.Dev)
	if errCode != "" {
		msg := uiText("vi", "flowType và contextType không khớp.", "flowType and contextType mismatch.", "flowType 与 contextType 不匹配。")
		if errCode == "missing_flow_type" {
			msg = uiText("vi", "Thiếu flowType bắt buộc.", "Missing required flowType.", "缺少 flowType。")
		}
		writeSSE(w, map[string]any{"stage": "blocked", "reason_code": errCode, "message": msg})
		return
	}

	writeSSE(w, stageEvent("started", map[string]any{
		"requestId": req.RequestID, "flowType": req.FlowType, "taskType": req.TaskType,
		"contextType": req.ContextType, "appId": req.AppID, "model": req.Model,
	}))

	attachments := services.ParseAttachmentsFromParams(params)
	scan := services.ScanAttachments(attachments, req.ContextType)
	if blocked, reason := services.MultimodalRouteGuard(scan, false); blocked {
		writeSSE(w, services.BlockedMultimodalSSE(req, reason))
		writeSSE(w, stageEvent("request_complete", map[string]any{"requestId": req.RequestID, "elapsedMs": 0}))
		return
	}
	if scan.TotalCount > 0 {
		writeSSE(w, services.AttachmentIntakeSSE(req, scan))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}

	retrievalAuth := services.RetrievalAuthAnonymous
	if auth != nil {
		retrievalAuth = services.BuildRetrievalAuthContext(auth.AppID, auth.Dev, auth.IsSubUser, auth.BranchID, auth.DeptID, auth.DataScope)
	}
	pipelineInput := services.PipelineInput{Auth: retrievalAuth, Attachments: attachments}

	phase1 := services.PreparePhase1Pipeline(deps.Config, deps.RM, req, pipelineInput)
	responseMode := phase1.ResponseMode
	req.ResponseMode = responseMode

	fullCode := req.FullCurrentCode
	if fullCode == "" {
		fullCode = req.CurrentCode
	}
	useMapReduce := services.ShouldUseMapReduceAnalyze(deps.Config, req, phase1, len(fullCode))
	if !useMapReduce && responseMode == "analyze" {
		req.CurrentCode = services.TruncateMiddle(
			req.CurrentCode,
			services.MaxOutgoingEditorChars(deps.Config, req.ContextType, "analyze"),
		)
	}
	for _, evt := range services.Phase1SSEEvents(req, phase1) {
		if evt["stage"] == "attachment_intake" {
			continue
		}
		writeSSE(w, evt)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}

	gf := services.TryGreenfieldScaffoldFirst(deps.Config, deps.Llama, req, phase1)
	for _, evt := range gf.SSEEvents {
		writeSSE(w, evt)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}
	if gf.Applied && gf.MenuJSON != "" {
		elapsed := int64(0)
		completion := services.CodeStreamCompletion(req, gf.MenuJSON, req.CurrentCode, gf.ModelLabel, elapsed)
		writeSSE(w, completion)
		services.RecordCodeEditFromCompletion(deps.Config, req, completion, gf.MenuJSON)
		writeSSE(w, stageEvent("request_complete", map[string]any{"requestId": req.RequestID, "elapsedMs": elapsed}))
		return
	}

	flushSSE := func() {
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}
	emitSSE := func(evt map[string]any) {
		writeSSE(w, evt)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	startedAt := time.Now()
	modelLabel := services.StreamingModelLabel(deps.Config, deps.Llama)

	if useMapReduce {
		writeSSE(w, stageEvent("local_pre_analysis", map[string]any{
			"requestId": req.RequestID, "status": "local_map_reduce_ready", "attempted": true,
			"handledLocally": true, "reason_code": "map_reduce_broad_analysis",
			"responseMode": responseMode, "sourceChars": len(fullCode),
			"constrainedTier": services.IsConstrained8GbTier(deps.Config),
			"mapReduceMinChars": services.MapReduceMinCodeChars(deps.Config),
		}))
		writeSSE(w, stageEvent("streaming_started", map[string]any{
			"requestId": req.RequestID, "model": "local_provider", "percent": 15,
			"responseMode": responseMode, "mapReduce": true,
		}))
		flushSSE()

		result, mrErr := services.RunMapReduceAnalyze(ctx, deps.Config, deps.Llama, req, fullCode, emitSSE, flushSSE)
		if mrErr != nil {
			log.Printf("AiCodeStream: map-reduce failed requestId=%s err=%v sourceChars=%d", req.RequestID, mrErr, len(fullCode))
			writeSSE(w, stageEvent("error", map[string]any{
				"requestId": req.RequestID, "reason_code": "local_map_reduce_failed",
				"message": uiText(req.UILang,
					"Map-reduce phân tích thất bại. Thử bôi đen vùng code nhỏ hơn hoặc dùng /analyze.",
					"Map-reduce analysis failed. Try selecting a smaller code region or use /analyze.",
					"Map-reduce 分析失败。请选中更小的代码区域或使用 /analyze。",
				),
				"sourceChars": len(fullCode), "error": mrErr.Error(),
			}))
			flushSSE()
		}
		if result == "" {
			result = uiText(req.UILang,
				"AI local không trả về nội dung sau map-reduce. Hãy thử lại với vùng code nhỏ hơn.",
				"Local AI returned no content after map-reduce. Retry with a smaller code region.",
				"本地 AI 在 map-reduce 后未返回内容。请用更小的代码区域重试。",
			)
		}
		elapsed := time.Since(startedAt).Milliseconds()
		completion := services.CodeStreamCompletion(req, result, req.CurrentCode, modelLabel, elapsed)
		writeSSE(w, completion)
		writeSSE(w, stageEvent("request_complete", map[string]any{
			"requestId": req.RequestID, "elapsedMs": elapsed, "mapReduce": true,
		}))
		return
	}

	prompt := services.BuildCodeStreamLocalPromptFull(deps.Config, req, phase1.LearningBlock, phase1.ComprehendBlock, phase1.TenantRAG.Block, phase1.Multimodal.CompactContext, phase1.Workspace.Block)

	writeSSE(w, stageEvent("local_pre_analysis", map[string]any{
		"requestId": req.RequestID, "status": "local_context_ready", "attempted": true,
		"handledLocally": true, "reason_code": "phase1_orchestration_ready",
		"localOnlyEnabled": true, "hasLocalContext": len(phase1.LearningBlock) > 0,
		"responseMode": responseMode, "routingTier": phase1.Orchestration.RoutingTier,
		"promptChars": len(prompt), "constrainedTier": services.IsConstrained8GbTier(deps.Config),
		"promptCap": services.EffectiveLocalPromptCap(deps.Config, req.ContextType, responseMode),
		"maxOutputTokens": services.EffectiveInferenceMaxTokensFromParams(deps.Config, responseMode, params),
		"printImport": services.IsLineItemsPdfImport(req),
	}))
	writeSSE(w, stageEvent("streaming_started", map[string]any{
		"requestId": req.RequestID, "model": "local_provider", "estimatedTotalChars": len(prompt) / 4, "percent": 15,
		"responseMode": responseMode,
	}))

	var full strings.Builder
	streamPiece := func(piece string) error {
		if piece == "" {
			return nil
		}
		full.WriteString(piece)
		writeSSE(w, stageEvent("streaming", map[string]any{
			"requestId": req.RequestID, "chunk": piece, "localProviderPrimary": true, "attempt": 1,
		}))
		pct := 12 + full.Len()/120
		if pct > 95 {
			pct = 95
		}
		writeSSE(w, stageEvent("streaming_progress", map[string]any{
			"requestId": req.RequestID, "charsReceived": full.Len(), "percent": pct,
		}))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		return nil
	}

	if deps.Llama.IsAvailable() {
		localPhase := "infer"
		if !deps.Llama.IsModelLoaded() {
			localPhase = "loading"
		}
		writeSSE(w, stageEvent("waiting_gemini", map[string]any{
			"requestId": req.RequestID, "model": "local_provider", "localPhase": localPhase,
			"percent": 12, "estimatedWaitSecs": 35,
		}))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}

		streamErr := deps.Llama.StreamCompletionWithTokens(ctx, prompt, services.EffectiveInferenceMaxTokensFromParams(deps.Config, responseMode, params), streamPiece)
		var completeErr error
		if streamErr != nil {
			log.Printf("AiCodeStream: stream error requestId=%s err=%v promptChars=%d", req.RequestID, streamErr, len(prompt))
			writeSSE(w, stageEvent("error", map[string]any{
				"requestId": req.RequestID, "reason_code": "local_inference_stream_error",
				"message": uiText(req.UILang,
					"Inference local lỗi (server 8GB có thể hết RAM). Thử /analyze với ít code hơn hoặc bôi đen vùng cần phân tích.",
					"Local inference failed (8GB server may be out of RAM). Try /analyze with less code or select a smaller region.",
					"本地推理失败（8GB 服务器可能内存不足）。请用 /analyze 并减少代码或选中更小区域。",
				),
				"promptChars": len(prompt), "streamError": streamErr.Error(),
			}))
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
		if streamErr != nil || full.Len() == 0 {
			var text string
			text, completeErr = deps.Llama.CompleteWithTokens(ctx, prompt, services.EffectiveInferenceMaxTokensFromParams(deps.Config, responseMode, params))
			if completeErr == nil {
				cleaned := services.CleanLocalModelOutput(text)
				if cleaned != "" && full.Len() == 0 {
					_ = streamPiece(cleaned)
				} else if cleaned != "" && full.String() != cleaned {
					full.Reset()
					full.WriteString(cleaned)
				}
			}
			if full.Len() == 0 {
				log.Printf("AiCodeStream: empty local output requestId=%s streamErr=%v completeErr=%v native=%v",
					req.RequestID, streamErr, completeErr, deps.Llama.UsesNative())
			}
		}
	} else {
		unavailable := services.LocalUnavailableMessage() + "\n\n(" + services.LocalUnavailableHint() + ")"
		if deps.Llama.ModelOnDisk() {
			unavailable = uiText(req.UILang,
				"Model GGUF có trên disk nhưng inference chưa sẵn sàng.\n\n("+services.LocalUnavailableHint()+")",
				"GGUF model is on disk but inference is not ready.\n\n("+services.LocalUnavailableHint()+")",
				"磁盘上有 GGUF 模型但推理未就绪。\n\n("+services.LocalUnavailableHint()+")",
			)
		}
		full.WriteString(unavailable)
		writeSSE(w, stageEvent("streaming", map[string]any{
			"requestId": req.RequestID, "chunk": unavailable, "localProviderPrimary": false,
		}))
	}

	result := services.CleanLocalModelOutput(full.String())
	if req.ContextType == "menu_json" && responseMode == "edit" && result != "" {
		result = services.MaybeApplyGreenfieldMenuScaffold(result, req.Message, phase1.BusinessSpec)
	}
	if result == "" && deps.Llama.IsAvailable() {
		reason := "empty_local_output"
		if services.IsConstrained8GbTier(deps.Config) && len(prompt) > services.EffectiveLocalPromptCap(deps.Config, req.ContextType, responseMode) {
			reason = "prompt_context_overflow_8gb"
		}
		writeSSE(w, stageEvent("blocked", map[string]any{
			"requestId": req.RequestID, "reason_code": reason,
			"message": uiText(req.UILang,
				"AI local không trả về patch (server 8GB — prompt đã được cắt để vừa context 8192). Thử yêu cầu ngắn hơn hoặc chọn ít code hơn.",
				"Local AI returned no patch (8GB server — prompt was clamped to fit 8192 context). Try a shorter request or less code.",
				"本地 AI 未返回补丁（8GB 服务器 — 提示已裁剪以适配 8192 上下文）。请缩短请求或减少代码。",
			),
			"promptChars": len(prompt),
		}))
		result = uiText(req.UILang,
			"AI local không trả về nội dung. Hãy thử lại hoặc kiểm tra build native (-tags llamacpp).",
			"Local AI returned no content. Retry or check native build (-tags llamacpp).",
			"本地 AI 未返回内容。请重试或检查 native 构建（-tags llamacpp）。",
		)
	}

	elapsed := time.Since(startedAt).Milliseconds()
	completion := services.CodeStreamCompletion(req, result, req.CurrentCode, modelLabel, elapsed)
	writeSSE(w, completion)
	services.RecordCodeEditFromCompletion(deps.Config, req, completion, result)
	writeSSE(w, stageEvent("request_complete", map[string]any{"requestId": req.RequestID, "elapsedMs": elapsed}))
}

func handleAssistantChatStream(deps StreamDeps, w http.ResponseWriter, params map[string]any, auth *security.AuthUser) {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	if auth == nil {
		writeSSE(w, map[string]any{"error": "Not authenticated"})
		return
	}
	message := paramStr(params, "message")
	prompt := services.PrepareLocalProviderPrompt("Assistant chat:\n"+message+"\n\nReply:", 32_000)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	if deps.Llama.IsAvailable() {
		_ = deps.Llama.StreamCompletion(ctx, prompt, func(token string) error {
			writeSSE(w, map[string]any{"token": token})
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
			return nil
		})
		writeSSEData(w, "[DONE]")
		return
	}
	errMsg := services.LocalUnavailableMessage()
	if deps.Llama.ModelOnDisk() {
		errMsg = "Model GGUF có trên disk nhưng inference chưa sẵn sàng. " + services.LocalUnavailableHint()
	} else {
		errMsg = errMsg + ". " + services.LocalUnavailableHint()
	}
	writeSSE(w, map[string]any{"error": errMsg})
}

func handleExecuteLocalPlan(deps StreamDeps, w http.ResponseWriter, params map[string]any) {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")

	message := paramStr(params, "message")
	appID := paramStr(params, "appId")
	if appID == "" {
		appID = "csm"
	}
	contextType := paramStr(params, "contextType")
	if contextType == "" {
		contextType = "code"
	}
	responseMode := paramStr(params, "responseMode")
	if responseMode == "" {
		responseMode = "edit"
	}
	currentCode := paramStr(params, "currentCode")
	requestID := paramStr(params, "requestId")
	if requestID == "" {
		requestID = paramStr(params, "jobId")
	}
	if requestID == "" {
		requestID = fmt.Sprintf("local-%d", time.Now().UnixMilli())
	}
	executePatch := paramBool(params, "executePatch", responseMode == "edit")

	req := &services.CodeStreamRequest{
		RequestID: requestID, AppID: appID, FlowType: map[string]string{"menu_json": "menu_manager", "code": "code_editor"}[contextType],
		TaskType: "menu_design", ContextType: contextType,
		Message: message, CurrentCode: currentCode, ResponseMode: responseMode,
	}
	if req.FlowType == "" {
		req.FlowType = "code_editor"
	}

	writeSSE(w, stageEvent("preparing", map[string]any{
		"status": "running", "message": "Bắt đầu local execute plan", "current": 0, "total": 5, "percent": 5, "responseMode": responseMode,
	}))
	phase1 := services.PreparePhase1Pipeline(deps.Config, deps.RM, req, services.PipelineInput{
		Attachments: services.ParseAttachmentsFromParams(params),
	})
	responseMode = phase1.ResponseMode
	for _, evt := range services.Phase1SSEEvents(req, phase1) {
		writeSSE(w, evt)
	}

	startedAt := time.Now()
	modelLabel := services.StreamingModelLabel(deps.Config, deps.Llama)
	var rawResult string

	if executePatch && deps.Llama.IsAvailable() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()

		if contextType == "menu_json" {
			prompt := services.BuildCodeStreamLocalPromptFull(deps.Config, req, phase1.LearningBlock, phase1.ComprehendBlock, phase1.TenantRAG.Block, phase1.Multimodal.CompactContext, phase1.Workspace.Block)
			rawResult, _ = deps.Llama.Complete(ctx, prompt)
		} else if contextType == "code" && currentCode != "" {
			prompt := buildPatchPrompt(message, currentCode)
			rawResult, _ = deps.Llama.Complete(ctx, prompt)
		}
	}

	rawResult = services.CleanLocalModelOutput(rawResult)
	if rawResult != "" {
		writeSSE(w, map[string]any{
			"stage": "streaming", "status": "running", "message": "Đang stream patch local",
			"chunk": rawResult, "responseMode": responseMode, "contextType": contextType, "model": "local_provider",
		})
	}

	elapsed := time.Since(startedAt).Milliseconds()
	if rawResult != "" {
		completion := services.CodeStreamCompletion(req, rawResult, currentCode, modelLabel, elapsed)
		completion["status"] = "done"
		completion["message"] = "Local execute plan hoàn tất với patch local"
		completion["localProviderPrimaryUsed"] = true
		completion["result"] = map[string]any{
			"appId": appID, "applyDynamicIngestion": false, "ingestCount": 0, "aggregateScopeMask": phase1.Orchestration.ScopeMask,
		}
		writeSSE(w, completion)
		services.RecordCodeEditFromCompletion(deps.Config, req, completion, rawResult)
		return
	}

	writeSSE(w, map[string]any{
		"stage": "streaming_started", "status": "running", "message": "Chuẩn bị stream kết quả",
		"requestId": requestID, "model": "local_provider", "percent": 12,
	})
	writeSSE(w, map[string]any{
		"stage": "complete", "status": "done", "message": "Local execute plan hoàn tất (dry-run streaming)",
		"responseMode": responseMode, "elapsedMs": elapsed,
		"result": map[string]any{"appId": appID, "applyDynamicIngestion": false, "ingestCount": 0, "aggregateScopeMask": 0},
	})
}

func buildPatchPrompt(message, currentCode string) string {
	raw := fmt.Sprintf(`You are a local code patch generator.
Return ONLY valid JSON object with this exact schema:
{"summary":"...","changes":["..."],"textEdits":[{"startLine":1,"endLine":1,"replacement":"...","action":"add|edit|delete"}]}
Rules:
- Use 1-based line numbers.
- Do not return markdown fences or explanations.
- Keep textEdits minimal and deterministic.
- If no change needed, return textEdits as empty array.

User request:
%s

Current code:
%s`, message, currentCode)
	return services.PrepareLocalProviderPrompt(raw, 32_000)
}

func stageEvent(stage string, data map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range data {
		out[k] = v
	}
	out["stage"] = stage
	return out
}

func writeSSE(w http.ResponseWriter, payload map[string]any) {
	writeSSEData(w, mustJSON(payload))
}

func writeSSEData(w http.ResponseWriter, data string) {
	fmt.Fprintf(w, "data: %s\n\n", data)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func uiText(lang, vi, en, zh string) string {
	switch lang {
	case "en":
		return en
	case "zh", "zh-CN", "zh-TW":
		return zh
	default:
		return vi
	}
}
