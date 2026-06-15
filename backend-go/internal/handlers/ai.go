package handlers

import (
	"strconv"
	"strings"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/services"
)

type AiHandler struct {
	cfg   config.AppConfig
	llama *services.LlamaService
}

func NewAiHandler(cfg config.AppConfig, llama *services.LlamaService) *AiHandler {
	return &AiHandler{cfg: cfg, llama: llama}
}

func (h *AiHandler) HandleAiLocal(path string) *model.StandardResponse {
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	ops := services.NewAiLocalOpsService(h.cfg)
	switch {
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
		result = map[string]any{"recorded": true, "type": "quick_fix"}
	case "/ai-code-stream/edit-candidate-feedback":
		result = map[string]any{"recorded": true, "type": "edit_candidate"}
	case "/ai-code-stream/agentic-approval-feedback":
		result = map[string]any{"recorded": true, "type": "agentic"}
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
	case "/ai-orchestration-preview", "/ai-quality-check", "/ai-token-optimize":
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

func (h *AiHandler) handleMenuEditorApply(params map[string]any) map[string]any {
	requestID := paramStr(params, "requestId")
	menuJSON, mergeStats, ok := services.TakeMenuEditorApplyPayload(requestID)
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
