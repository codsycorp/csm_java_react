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
	req.UserID = strings.TrimSpace(auth.UserID)
	preMode := services.ResolveResponseMode(req)
	req.ResponseMode = preMode
	sessionMemoryCap := services.SessionMemoryBudget(deps.Config, req.ContextType, preMode)
	injectedConversation := services.InjectScopedConversationContextIntoRequest(
		deps.RM,
		req,
		sessionMemoryCap,
	)
	if req.EditorMetadata == nil {
		req.EditorMetadata = map[string]any{}
	}
	req.EditorMetadata["__sessionMemoryCap"] = sessionMemoryCap
	sessionMemorySource, sessionMemoryCapReported, sessionMemoryUsedChars := services.ConversationMemoryTelemetryFromMetadata(req.EditorMetadata)
	if sessionMemoryCapReported <= 0 {
		sessionMemoryCapReported = sessionMemoryCap
	}
	if sessionMemoryUsedChars <= 0 && injectedConversation != "" {
		sessionMemoryUsedChars = len(injectedConversation)
	}
	writeSSE(w, stageEvent("context_memory", map[string]any{
		"requestId":                req.RequestID,
		"responseMode":             preMode,
		"sessionMemoryCap":         sessionMemoryCapReported,
		"sessionMemoryUsedChars":   sessionMemoryUsedChars,
		"sessionMemorySource":      sessionMemorySource,
		"sessionMemoryInjected":    injectedConversation != "",
		"sessionMemoryInjectChars": len(injectedConversation),
		"constrainedTier":          services.IsConstrained8GbTier(deps.Config),
	}))

	attachments := services.ParseAttachmentsFromParams(params)
	scan := services.ScanAttachments(attachments, req.ContextType)
	if blocked, reason := services.MultimodalRouteGuard(scan, false); blocked {
		writeSSE(w, services.BlockedMultimodalSSE(req, reason))
		writeSSE(w, stageEvent("request_complete", withSessionMemoryTelemetry(map[string]any{
			"requestId": req.RequestID, "elapsedMs": 0,
		}, sessionMemorySource, sessionMemoryCapReported, sessionMemoryUsedChars)))
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

	phase1 := services.PreparePhase1Pipeline(deps.Config, deps.RM, deps.Llama, req, pipelineInput)
	responseMode := phase1.ResponseMode
	req.ResponseMode = responseMode
	if services.ShouldQuickReply(phase1.Intent, responseMode) {
		for _, evt := range services.Phase1SSEEvents(req, phase1) {
			if evt["stage"] == "attachment_intake" {
				continue
			}
			writeSSE(w, evt)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
		handleQuickDirectReply(deps, w, req, auth, phase1.Orchestration.RoutingTier)
		return
	}

	if req.ContextType == "menu_json" && responseMode == "edit" {
		resolved := services.ResolveMenuEditEditorBase(req)
		log.Printf("AiCodeStream menu edit requestId=%s curLen=%d fullLen=%d fullOrigLen=%d truncated=%v resolvedLen=%d health=%s nodes=%d",
			req.RequestID, len(req.CurrentCode), len(req.FullCurrentCode), req.FullCurrentCodeOrigLen, req.FullCurrentCodeTruncated,
			len(resolved), services.MenuEditorBaseHealth(resolved), services.CountMenuNodesFromDraft(resolved))
		if req.FullCurrentCodeTruncated {
			elapsed := int64(0)
			completion := services.CodeStreamCompletion(req, "", resolved, services.StreamingModelLabel(deps.Config, deps.Llama), elapsed)
			writeSSE(w, completion)
			writeSSE(w, stageEvent("request_complete", withSessionMemoryTelemetry(map[string]any{
				"requestId": req.RequestID, "elapsedMs": elapsed, "menuPayloadTruncated": true,
			}, sessionMemorySource, sessionMemoryCapReported, sessionMemoryUsedChars)))
			return
		}
	}

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
		services.CacheCodeStreamParts(req.RequestID, gf.MenuJSON, "done")
		services.RecordCodeEditFromCompletion(deps.Config, deps.RM, req, completion, gf.MenuJSON)
		services.RecordScopedConversationTurnFromRequest(deps.RM, req, gf.MenuJSON, map[string]any{
			"requestId":    req.RequestID,
			"responseMode": responseMode,
			"routingTier":  phase1.Orchestration.RoutingTier,
			"source":       "ai_code_stream_greenfield",
		})
		writeSSE(w, stageEvent("request_complete", withSessionMemoryTelemetry(map[string]any{
			"requestId": req.RequestID, "elapsedMs": elapsed,
		}, sessionMemorySource, sessionMemoryCapReported, sessionMemoryUsedChars)))
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
			"constrainedTier":        services.IsConstrained8GbTier(deps.Config),
			"mapReduceMinChars":      services.MapReduceMinCodeChars(deps.Config),
			"expertCoverageScore":    phase1.ExpertRouting.CoverageScore,
			"expertMatchedExamples":  phase1.ExpertRouting.MatchedExamples,
			"expertRiskLevel":        phase1.ExpertRouting.RiskLevel,
			"expertRecommendedRoute": phase1.ExpertRouting.RecommendedRoute,
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
		services.CacheCodeStreamParts(req.RequestID, result, "done")
		services.RecordScopedConversationTurnFromRequest(deps.RM, req, result, map[string]any{
			"requestId":    req.RequestID,
			"responseMode": responseMode,
			"routingTier":  phase1.Orchestration.RoutingTier,
			"source":       "ai_code_stream_map_reduce",
		})
		writeSSE(w, stageEvent("request_complete", withSessionMemoryTelemetry(map[string]any{
			"requestId": req.RequestID, "elapsedMs": elapsed, "mapReduce": true,
		}, sessionMemorySource, sessionMemoryCapReported, sessionMemoryUsedChars)))
		return
	}

	prompt := services.BuildCodeStreamLocalPromptFull(deps.Config, req, phase1.LearningBlock, phase1.ComprehendBlock, phase1.TenantRAG.Block, phase1.Multimodal.CompactContext, phase1.Workspace.Block)
	sessionMemorySource, sessionMemoryCapReported, sessionMemoryUsedChars = services.ConversationMemoryTelemetryFromMetadata(req.EditorMetadata)
	if sessionMemoryCapReported <= 0 {
		sessionMemoryCapReported = sessionMemoryCap
	}

	if services.ShouldUseIncrementalPlanExecute(deps.Config, req, phase1) && deps.Llama.IsAvailable() {
		writeSSE(w, stageEvent("local_pre_analysis", map[string]any{
			"requestId": req.RequestID, "status": "incremental_plan_ready", "attempted": true,
			"handledLocally": true, "reason_code": "incremental_plan_execute",
			"responseMode": responseMode, "incrementalPlan": true,
			"slicePlanner":           req.ContextType == "menu_json" && responseMode == "edit",
			"expertCoverageScore":    phase1.ExpertRouting.CoverageScore,
			"expertMatchedExamples":  phase1.ExpertRouting.MatchedExamples,
			"expertRiskLevel":        phase1.ExpertRouting.RiskLevel,
			"expertRecommendedRoute": phase1.ExpertRouting.RecommendedRoute,
		}))
		writeSSE(w, stageEvent("streaming_started", map[string]any{
			"requestId": req.RequestID, "model": "local_provider", "percent": 15,
			"responseMode": responseMode, "incrementalPlan": true,
		}))
		flushSSE()
		var incrResult services.IncrementalPlanResult
		var incrErr error
		editPlan := services.PlanEditTask(req, responseMode)
		useMenuDeterministic := req.ContextType == "menu_json" && responseMode == "edit" &&
			(services.ShouldRunMenuDeterministicEdit(req, responseMode) || editPlan.Enabled)
		if useMenuDeterministic {
			log.Printf("AiCodeStream: menu deterministic edit requestId=%s sourceChars=%d", req.RequestID, editPlan.SourceChars)
			incrResult, incrErr = services.RunMenuSliceEditExecute(ctx, deps.Config, deps.Llama, req, phase1, func(evt map[string]any) {
				writeSSE(w, evt)
			}, flushSSE)
		} else {
			log.Printf("AiCodeStream: incremental LLM plan requestId=%s contextType=%s", req.RequestID, req.ContextType)
			incrResult, incrErr = services.RunIncrementalPlanExecute(ctx, deps.Config, deps.Llama, req, phase1, func(evt map[string]any) {
				writeSSE(w, evt)
			}, flushSSE)
		}
		result := incrResult.FinalText
		if incrErr != nil {
			log.Printf("AiCodeStream: incremental plan failed requestId=%s err=%v — fallback single-shot", req.RequestID, incrErr)
			if req.ContextType == "menu_json" && responseMode == "edit" && services.IsMenuTableFieldI18nComboRequest(req.Message) {
				base := services.CoerceMenuEditorPayload(services.ResolveMenuEditEditorBase(req))
				if merged, _, fixed := services.ApplyDeterministicMenuTableFieldFixes(base); fixed > 0 && merged != "" {
					log.Printf("AiCodeStream: deterministic field fixes after slice fail requestId=%s fixed=%d", req.RequestID, fixed)
					result = merged
					incrErr = nil
				}
			}
		}
		if incrErr == nil && result != "" {
			elapsed := time.Since(startedAt).Milliseconds()
			log.Printf("AiCodeStream: incremental done requestId=%s resultLen=%d elapsedMs=%d", req.RequestID, len(result), elapsed)
			editorBase := services.ResolveMenuEditEditorBase(req)
			tComplete := time.Now()
			completion := services.CodeStreamCompletion(req, result, editorBase, modelLabel, elapsed)
			log.Printf("AiCodeStream: completion assembled requestId=%s ms=%d", req.RequestID, time.Since(tComplete).Milliseconds())
			writeSSE(w, completion)
			services.CacheCodeStreamParts(req.RequestID, result, "done")
			if responseMode == "edit" && req.ContextType == "menu_json" {
				services.RecordCodeEditFromCompletion(deps.Config, deps.RM, req, completion, result)
			}
			services.RecordScopedConversationTurnFromRequest(deps.RM, req, result, map[string]any{
				"requestId":    req.RequestID,
				"responseMode": responseMode,
				"routingTier":  phase1.Orchestration.RoutingTier,
				"source":       "ai_code_stream_incremental",
			})
			writeSSE(w, stageEvent("request_complete", withSessionMemoryTelemetry(map[string]any{
				"requestId": req.RequestID, "elapsedMs": elapsed, "incrementalPlan": true,
				"planSteps": len(incrResult.Plan.Steps),
			}, sessionMemorySource, sessionMemoryCapReported, sessionMemoryUsedChars)))
			return
		}
	}

	writeSSE(w, stageEvent("local_pre_analysis", map[string]any{
		"requestId": req.RequestID, "status": "local_context_ready", "attempted": true,
		"handledLocally": true, "reason_code": "phase1_orchestration_ready",
		"localOnlyEnabled": true, "hasLocalContext": len(phase1.LearningBlock) > 0,
		"responseMode": responseMode, "routingTier": phase1.Orchestration.RoutingTier,
		"expertCoverageScore":    phase1.ExpertRouting.CoverageScore,
		"expertMatchedExamples":  phase1.ExpertRouting.MatchedExamples,
		"expertRiskLevel":        phase1.ExpertRouting.RiskLevel,
		"expertRecommendedRoute": phase1.ExpertRouting.RecommendedRoute,
		"sessionMemoryCap":       sessionMemoryCapReported,
		"sessionMemorySource":    sessionMemorySource,
		"sessionMemoryUsedChars": sessionMemoryUsedChars,
		"promptChars":            len(prompt), "constrainedTier": services.IsConstrained8GbTier(deps.Config),
		"promptCap":       services.EffectiveLocalPromptCap(deps.Config, req.ContextType, responseMode),
		"maxOutputTokens": services.EffectiveInferenceMaxTokensFromParams(deps.Config, responseMode, params),
		"printImport":     services.IsLineItemsPdfImport(req),
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
	editorBase := req.CurrentCode
	if req.ContextType == "menu_json" && responseMode == "edit" {
		editorBase = services.ResolveMenuEditEditorBase(req)
	}
	completion := services.CodeStreamCompletion(req, result, editorBase, modelLabel, elapsed)
	writeSSE(w, completion)
	services.CacheCodeStreamParts(req.RequestID, result, "done")
	services.RecordCodeEditFromCompletion(deps.Config, deps.RM, req, completion, result)
	services.RecordScopedConversationTurnFromRequest(deps.RM, req, result, map[string]any{
		"requestId":    req.RequestID,
		"responseMode": responseMode,
		"routingTier":  phase1.Orchestration.RoutingTier,
		"source":       "ai_code_stream_main",
	})
	writeSSE(w, stageEvent("request_complete", withSessionMemoryTelemetry(map[string]any{
		"requestId": req.RequestID, "elapsedMs": elapsed,
	}, sessionMemorySource, sessionMemoryCapReported, sessionMemoryUsedChars)))
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
		TaskType: map[string]string{"menu_json": "menu_design", "code": "code_assistant"}[contextType], ContextType: contextType,
		Message: message, CurrentCode: currentCode, ResponseMode: responseMode,
	}
	if req.FlowType == "" {
		req.FlowType = "code_editor"
	}
	if req.TaskType == "" {
		req.TaskType = "code_assistant"
	}

	writeSSE(w, stageEvent("preparing", map[string]any{
		"status": "running", "message": "Bắt đầu local execute plan", "current": 0, "total": 5, "percent": 5, "responseMode": responseMode,
	}))
	phase1 := services.PreparePhase1Pipeline(deps.Config, deps.RM, deps.Llama, req, services.PipelineInput{
		Attachments: services.ParseAttachmentsFromParams(params),
	})
	responseMode = phase1.ResponseMode
	req.ResponseMode = responseMode
	for _, evt := range services.Phase1SSEEvents(req, phase1) {
		writeSSE(w, evt)
	}
	if services.ShouldQuickReply(phase1.Intent, responseMode) {
		handleQuickDirectReply(deps, w, req, nil, phase1.Orchestration.RoutingTier)
		return
	}

	startedAt := time.Now()
	modelLabel := services.StreamingModelLabel(deps.Config, deps.Llama)
	var rawResult string
	var inferErr error

	if deps.Llama.IsAvailable() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()

		writeSSE(w, stageEvent("streaming_started", map[string]any{
			"requestId": requestID,
			"model":     "local_provider",
			"percent":   12,
			"mode":      map[bool]string{true: "patch", false: "prompt"}[executePatch],
		}))

		if executePatch && contextType == "menu_json" {
			prompt := services.BuildCodeStreamLocalPromptFull(deps.Config, req, phase1.LearningBlock, phase1.ComprehendBlock, phase1.TenantRAG.Block, phase1.Multimodal.CompactContext, phase1.Workspace.Block)
			rawResult, inferErr = deps.Llama.Complete(ctx, prompt)
		} else if executePatch && contextType == "code" && currentCode != "" {
			prompt := buildPatchPrompt(message, currentCode)
			rawResult, inferErr = deps.Llama.Complete(ctx, prompt)
		} else {
			// JS integrations often send business/plan tasks with executePatch=false; run prompt mode instead of dry-run.
			prompt := services.BuildCodeStreamLocalPromptFull(deps.Config, req, phase1.LearningBlock, phase1.ComprehendBlock, phase1.TenantRAG.Block, phase1.Multimodal.CompactContext, phase1.Workspace.Block)
			rawResult, inferErr = deps.Llama.Complete(ctx, prompt)
		}
	} else {
		rawResult = services.LocalUnavailableMessage() + "\n\n(" + services.LocalUnavailableHint() + ")"
		if deps.Llama.ModelOnDisk() {
			rawResult = uiText(req.UILang,
				"Model GGUF có trên disk nhưng inference chưa sẵn sàng. "+services.LocalUnavailableHint(),
				"GGUF model exists on disk but local inference is not ready. "+services.LocalUnavailableHint(),
				"磁盘已有 GGUF 模型，但本地推理尚未就绪。"+services.LocalUnavailableHint(),
			)
		}
	}

	rawResult = services.CleanLocalModelOutput(rawResult)
	if inferErr != nil {
		writeSSE(w, stageEvent("error", map[string]any{
			"requestId":   requestID,
			"reason_code": "local_execute_plan_inference_error",
			"message": uiText(req.UILang,
				"Local inference lỗi khi thực thi task JS. Đang fallback thông điệp an toàn.",
				"Local inference failed while executing JS task. Falling back to a safe response.",
				"执行 JS 任务时本地推理失败，正在回退到安全响应。",
			),
			"error": inferErr.Error(),
		}))
	}
	if rawResult != "" {
		writeSSE(w, map[string]any{
			"stage": "streaming", "status": "running", "message": "Đang stream kết quả local",
			"chunk": rawResult, "responseMode": responseMode, "contextType": contextType, "model": "local_provider",
		})
	}

	elapsed := time.Since(startedAt).Milliseconds()
	if rawResult != "" {
		completion := services.CodeStreamCompletion(req, rawResult, currentCode, modelLabel, elapsed)
		completion["status"] = "done"
		completion["message"] = "Local execute plan hoàn tất"
		completion["localProviderPrimaryUsed"] = true
		completion["result"] = map[string]any{
			"appId": appID, "applyDynamicIngestion": false, "ingestCount": 0, "aggregateScopeMask": phase1.Orchestration.ScopeMask,
		}
		writeSSE(w, completion)
		services.CacheCodeStreamParts(requestID, rawResult, "done")
		services.RecordCodeEditFromCompletion(deps.Config, deps.RM, req, completion, rawResult)
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

func handleQuickDirectReply(deps StreamDeps, w http.ResponseWriter, req *services.CodeStreamRequest, auth *security.AuthUser, routingTier string) {
	writeSSE(w, stageEvent("local_pre_analysis", map[string]any{
		"requestId":    req.RequestID,
		"status":       "quick_reply_ready",
		"reason_code":  "answer_direct_fast_path",
		"responseMode": "analyze",
		"routingTier":  "planner_fast",
	}))
	writeSSE(w, stageEvent("streaming_started", map[string]any{
		"requestId":    req.RequestID,
		"model":        "local_provider",
		"percent":      20,
		"responseMode": "analyze",
	}))

	start := time.Now()
	modelLabel := services.StreamingModelLabel(deps.Config, deps.Llama)
	answer := ""
	var full strings.Builder
	streamPiece := func(piece string) {
		if piece == "" {
			return
		}
		full.WriteString(piece)
		writeSSE(w, stageEvent("streaming", map[string]any{
			"requestId": req.RequestID,
			"chunk":     piece,
		}))
		pct := 20 + full.Len()/24
		if pct > 95 {
			pct = 95
		}
		writeSSE(w, stageEvent("streaming_progress", map[string]any{
			"requestId":     req.RequestID,
			"charsReceived": full.Len(),
			"percent":       pct,
		}))
	}
	if deps.Llama != nil && deps.Llama.IsAvailable() {
		prompt := services.PrepareLocalProviderPrompt(
			"Bạn là trợ lý AI cục bộ. Trả lời ngắn gọn, đúng trọng tâm, không tạo patch code/menu nếu người dùng không yêu cầu chỉnh sửa.\n\nNgười dùng: "+strings.TrimSpace(req.Message),
			6000,
		)
		ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
		defer cancel()
		localPhase := "infer"
		if !deps.Llama.IsModelLoaded() {
			localPhase = "loading"
		}
		writeSSE(w, stageEvent("waiting_gemini", map[string]any{
			"requestId":         req.RequestID,
			"model":             "local_provider",
			"localPhase":        localPhase,
			"percent":           20,
			"estimatedWaitSecs": 8,
		}))
		streamErr := deps.Llama.StreamCompletionWithTokens(ctx, prompt, 220, func(token string) error {
			streamPiece(token)
			return nil
		})
		if streamErr != nil || full.Len() == 0 {
			if out, err := deps.Llama.CompleteWithTokens(ctx, prompt, 220); err == nil {
				cleaned := strings.TrimSpace(services.CleanLocalModelOutput(out))
				if cleaned != "" {
					if full.Len() == 0 {
						streamPiece(cleaned)
					} else {
						full.Reset()
						full.WriteString(cleaned)
					}
				}
			}
		}
		answer = strings.TrimSpace(services.CleanLocalModelOutput(full.String()))
	}
	if answer == "" {
		answer = uiText(req.UILang,
			"Mình đã nhận yêu cầu. Nội dung này không thuộc luồng chỉnh sửa code/menu, nên mình trả lời nhanh tại đây. Nếu bạn muốn mình sửa code hoặc menu JSON, hãy nói rõ phần cần chỉnh.",
			"I received your request. This is outside code/menu edit flows, so here is a quick direct answer. If you want code or menu JSON edits, specify exactly what to change.",
			"我已收到你的请求。该内容不属于代码/菜单编辑流程，因此先给你快速答复。若需修改代码或菜单 JSON，请明确要改的部分。",
		)
		if full.Len() == 0 {
			streamPiece(answer)
		}
	}

	elapsed := time.Since(start).Milliseconds()
	completion := services.CodeStreamCompletion(req, answer, req.CurrentCode, modelLabel, elapsed)
	writeSSE(w, completion)
	services.CacheCodeStreamParts(req.RequestID, answer, "done")
	if auth != nil {
		services.RecordScopedConversationTurnFromRequest(deps.RM, req, answer, map[string]any{
			"requestId":    req.RequestID,
			"responseMode": "analyze",
			"routingTier":  routingTier,
			"source":       "ai_code_stream_quick_reply",
		})
	}
	sessionMemorySource, sessionMemoryCapReported, sessionMemoryUsedChars := services.ConversationMemoryTelemetryFromMetadata(req.EditorMetadata)
	writeSSE(w, stageEvent("request_complete", withSessionMemoryTelemetry(map[string]any{
		"requestId": req.RequestID, "elapsedMs": elapsed,
	}, sessionMemorySource, sessionMemoryCapReported, sessionMemoryUsedChars)))
}

func withSessionMemoryTelemetry(base map[string]any, source string, capChars, usedChars int) map[string]any {
	if base == nil {
		base = map[string]any{}
	}
	base["sessionMemorySource"] = source
	base["sessionMemoryCap"] = capChars
	base["sessionMemoryUsedChars"] = usedChars
	return base
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
