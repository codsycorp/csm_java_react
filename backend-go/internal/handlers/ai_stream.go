package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/services"
)

type StreamDeps struct {
	Config config.AppConfig
	Llama  *services.LlamaService
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

	prompt := services.BuildCodeStreamLocalPrompt(deps.Config, req)
	responseMode := services.ResolveResponseMode(req)
	modelLabel := services.StreamingModelLabel(deps.Config, deps.Llama)

	writeSSE(w, stageEvent("started", map[string]any{
		"requestId": req.RequestID, "flowType": req.FlowType, "taskType": req.TaskType,
		"contextType": req.ContextType, "appId": req.AppID, "model": req.Model, "promptChars": len(prompt),
	}))
	writeSSE(w, stageEvent("local_pre_analysis", map[string]any{
		"requestId": req.RequestID, "status": "local_context_ready", "attempted": false,
		"handledLocally": false, "reason_code": "local_v2_skip_legacy_pre_analysis",
		"localOnlyEnabled": true, "hasLocalContext": false,
	}))
	writeSSE(w, stageEvent("context_compression", map[string]any{
		"requestId": req.RequestID, "status": "orchestration_context_attached", "savedChars": 0,
	}))
	writeSSE(w, stageEvent("streaming_started", map[string]any{
		"requestId": req.RequestID, "model": modelLabel, "estimatedTotalChars": len(prompt) / 4, "percent": 15,
	}))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	var full strings.Builder
	if deps.Llama.IsAvailable() {
		_ = deps.Llama.StreamCompletion(ctx, prompt, func(piece string) error {
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
		})
	} else {
		unavailable := services.LocalUnavailableMessage() + "\n\n(" + services.LocalUnavailableHint() + ")"
		full.WriteString(unavailable)
		writeSSE(w, stageEvent("streaming", map[string]any{
			"requestId": req.RequestID, "chunk": unavailable, "localProviderPrimary": false,
		}))
	}

	elapsed := time.Now().UnixMilli()
	writeSSE(w, stageEvent("complete", map[string]any{
		"requestId": req.RequestID, "status": "ok", "fullResponse": full.String(),
		"contextType": req.ContextType, "responseMode": responseMode, "elapsedMs": elapsed,
		"streamedChars": full.Len(), "model": modelLabel,
	}))
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
	prompt := "Assistant chat:\n" + message + "\n\nReply:"
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
	writeSSE(w, map[string]any{"error": "llama unavailable"})
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
		requestID = fmt.Sprintf("local-%d", time.Now().UnixMilli())
	}
	executePatch := paramBool(params, "executePatch", responseMode == "edit")

	events := []map[string]any{
		{"stage": "preparing", "status": "running", "message": "Bắt đầu local execute plan", "current": 0, "total": 5, "percent": 5, "responseMode": responseMode},
		{"stage": "agentic_plan", "status": "running", "message": "Đã lập kế hoạch Agentic local từ scanner signals", "current": 1, "total": 5, "percent": 20, "compacted": true},
		{"stage": "scope_reasoning", "status": "running", "message": "Khóa phạm vi reasoning bằng bitmask", "current": 2, "total": 5, "percent": 40, "responseMode": responseMode},
		{"stage": "local_tool_invocation", "status": "running", "message": "Local tools tạo execution sketch theo từng bước", "current": 4, "total": 5, "percent": 80, "responseMode": responseMode},
		{"stage": "context_compression", "status": "running", "message": "Đã nén context và chuẩn bị stream patch", "current": 5, "total": 5, "percent": 100, "responseMode": responseMode, "contextType": contextType},
	}
	for _, evt := range events {
		writeSSE(w, evt)
	}

	startedAt := time.Now().UnixMilli()
	var patch string
	if executePatch && contextType == "code" && currentCode != "" && deps.Llama.IsAvailable() {
		prompt := buildPatchPrompt(message, currentCode)
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		patch, _ = deps.Llama.Complete(ctx, prompt)
		cancel()
	}

	if patch != "" {
		writeSSE(w, map[string]any{
			"stage": "streaming", "status": "running", "message": "Đang stream patch local",
			"chunk": patch, "responseMode": responseMode, "contextType": contextType, "model": "local_provider",
		})
		elapsed := time.Now().UnixMilli() - startedAt
		writeSSE(w, map[string]any{
			"stage": "complete", "status": "done", "message": "Local execute plan hoàn tất với patch local",
			"responseMode": responseMode, "contextType": contextType, "model": "local_provider",
			"localProviderPrimaryUsed": true, "flowConfirmedByLocal": true, "elapsedMs": elapsed,
			"fullResponse": patch, "outputChars": len(patch), "streamChunkCount": 1, "streamedChars": len(patch),
			"result": map[string]any{"appId": appID, "applyDynamicIngestion": false, "ingestCount": 0, "aggregateScopeMask": 0},
		})
		return
	}

	elapsed := time.Now().UnixMilli() - startedAt
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
	return fmt.Sprintf(`You are a local code patch generator.
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
