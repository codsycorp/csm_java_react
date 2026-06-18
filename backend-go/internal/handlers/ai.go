package handlers

import (
	"strconv"
	"strings"

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
	case strings.HasSuffix(path, "/health"):
		r.Set("result", ops.Health(h.llama))
	case strings.HasSuffix(path, "/models"):
		r.Set("result", ops.ListModels(h.llama))
	case strings.HasSuffix(path, "/services"):
		r.Set("result", services.ListAIServices())
	default:
		r.Set("message", "AI local endpoint: "+path)
	}
	return r
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
	case "/ai-assistant-session-delete":
		result = map[string]any{"deleted": true, "sessionId": paramStr(params, "sessionId")}
	case "/ai-tasks/active":
		result = map[string]any{"tasks": []any{}}
	default:
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
