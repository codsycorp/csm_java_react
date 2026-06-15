package services

import (
	"fmt"
	"os"
	"strings"

	"csm_server/backend-go/internal/config"
)

type CodeStreamRequest struct {
	RequestID    string
	AppID        string
	FlowType     string
	TaskType     string
	ContextType  string
	Message      string
	CurrentCode  string
	Language     string
	Model        string
	UILang       string
	ResponseMode string
}

func ParseCodeStreamRequest(params map[string]any, authAppID string, isDev bool) (*CodeStreamRequest, string) {
	flowType := paramString(params, "flowType", "")
	if flowType == "" {
		return nil, "missing_flow_type"
	}
	contextType := paramString(params, "contextType", "code")
	expected := "code"
	if flowType == "menu_manager" {
		expected = "menu_json"
	}
	if contextType != expected {
		return nil, "flow_context_mismatch"
	}
	requestedApp := paramString(params, "appId", "")
	if requestedApp == "" {
		requestedApp = paramString(params, "app_id", "csm")
	}
	appID := requestedApp
	if !isDev {
		appID = authAppID
	}
	requestID := paramString(params, "jobId", "")
	if requestID == "" {
		requestID = paramString(params, "requestId", "")
	}
	if requestID == "" {
		requestID = newRequestID()
	}
	return &CodeStreamRequest{
		RequestID:    requestID,
		AppID:        appID,
		FlowType:     flowType,
		TaskType:     paramString(params, "taskType", "edit"),
		ContextType:  contextType,
		Message:      truncateStr(paramString(params, "message", ""), 32_000),
		CurrentCode:  truncateStr(paramString(params, "currentCode", ""), maxOutgoingEditorFromParams(params)),
		Language:     paramString(params, "language", "javascript"),
		Model:        paramString(params, "model", "auto"),
		UILang:       firstNonEmpty(paramString(params, "uiLang", ""), paramString(params, "ui_lang", ""), paramString(params, "uiLanguage", "vi")),
		ResponseMode: firstNonEmpty(paramString(params, "responseMode", ""), paramString(params, "response_mode", "")),
	}, ""
}

func maxOutgoingEditorFromParams(params map[string]any) int {
	ctxType := paramString(params, "contextType", "code")
	mode := firstNonEmpty(paramString(params, "responseMode", ""), paramString(params, "response_mode", ""))
	return MaxOutgoingEditorChars(config.AppConfig{}, ctxType, mode)
}

func ResolveResponseMode(req *CodeStreamRequest) string {
	if req.ResponseMode != "" {
		return req.ResponseMode
	}
	if strings.Contains(req.TaskType, "qa") || strings.Contains(req.Message, "?") {
		return "analyze"
	}
	return "edit"
}

func BuildCodeStreamLocalPrompt(cfg config.AppConfig, req *CodeStreamRequest) string {
	return BuildCodeStreamLocalPromptWithExtras(cfg, req, "", "", "")
}

func BuildCodeStreamLocalPromptWithExtras(cfg config.AppConfig, req *CodeStreamRequest, learningBlock, comprehendBlock, tenantRAGBlock string) string {
	return BuildCodeStreamLocalPromptFull(cfg, req, learningBlock, comprehendBlock, tenantRAGBlock, "", "")
}

func BuildCodeStreamLocalPromptFull(cfg config.AppConfig, req *CodeStreamRequest, learningBlock, comprehendBlock, tenantRAGBlock, multimodalBlock, workspaceBlock string) string {
	mode := ResolveResponseMode(req)
	intent := classifyLocalIntent(req.ContextType, mode)
	editorMax, ragMax, learningMax, workspaceMax := ConstrainedPromptSlotCaps(cfg)
	editor := truncateStr(req.CurrentCode, editorMax)
	userReq := truncateStr(req.Message, 32_000)
	learningBlock = truncateStr(learningBlock, learningMax)
	tenantRAGBlock = truncateStr(tenantRAGBlock, ragMax)
	workspaceBlock = truncateStr(workspaceBlock, workspaceMax)
	multimodalBlock = truncateStr(multimodalBlock, 3000)

	baseSystem := baseSystemMin
	if intent == "quick_question" {
		baseSystem = baseSystemAnalyzeMin
	}
	var contract string
	switch intent {
	case "menu_json":
		if IsEffectivelyEmptyMenuEditor(editor) {
			contract = ResolveMenuJsonContractForGreenfield(cfg)
		} else {
			contract = ResolveMenuJsonContractForLocal(cfg)
		}
	case "frontend_code":
		contract = ResolveCodeJsonContractForLocal(cfg)
	case "quick_question":
		contract = quickQuestionContract
	default:
		contract = frontendCodeContract
	}

	var sb strings.Builder
	sb.WriteString(baseSystem)
	sb.WriteString("\n\n")
	sb.WriteString(buildPromptLanguageBlock(req.UILang, userReq))
	sb.WriteString(contract)
	sb.WriteByte('\n')

	switch intent {
	case "menu_json":
		if kb := BuildMenuKnowledgeBlock(cfg, 12_000); kb != "" {
			sb.WriteString(kb)
			sb.WriteByte('\n')
		}
		if IsEffectivelyEmptyMenuEditor(editor) {
			sb.WriteString("[GREENFIELD_EMPTY_MENU]\n")
		} else if editor != "" {
			sb.WriteString("[ACTIVE_EDITOR_MENU_JSON]\n")
			sb.WriteString(editor)
			sb.WriteString("\n[/ACTIVE_EDITOR_MENU_JSON]\n\n")
		}
	case "frontend_code":
		if kb := BuildCodeKnowledgeBlock(cfg, 10_000); kb != "" {
			sb.WriteString(kb)
			sb.WriteByte('\n')
		}
		if editor != "" {
			sb.WriteString("[ACTIVE_EDITOR_CODE]\n")
			sb.WriteString(editor)
			sb.WriteString("\n[/ACTIVE_EDITOR_CODE]\n\n")
		}
	case "quick_question":
		if editor != "" && len(editor) <= 8_000 {
			sb.WriteString("[CONTEXT_SNIPPET]\n")
			sb.WriteString(editor)
			sb.WriteString("\n[/CONTEXT_SNIPPET]\n\n")
		}
	}

	if ctxBlock := loadAppContextBlock(cfg, req.AppID, 6_000); ctxBlock != "" {
		sb.WriteString("[SESSION_MEMORY]\n")
		sb.WriteString(ctxBlock)
		sb.WriteString("\n[/SESSION_MEMORY]\n\n")
	}
	if comprehendBlock != "" {
		sb.WriteString(comprehendBlock)
	}
	if tenantRAGBlock != "" {
		sb.WriteString(tenantRAGBlock)
	}
	if workspaceBlock != "" {
		sb.WriteString(workspaceBlock)
	}
	if multimodalBlock != "" {
		sb.WriteString("[ATTACHMENT_CONTEXT]\n")
		sb.WriteString(multimodalBlock)
		sb.WriteString("\n[/ATTACHMENT_CONTEXT]\n\n")
	}
	if learningBlock != "" {
		sb.WriteString("[AUTO_LEARNED_MEMORY]\n")
		sb.WriteString(learningBlock)
		sb.WriteString("\n[/AUTO_LEARNED_MEMORY]\n\n")
	} else if lb := BuildLearningContextBlock(cfg, req.AppID, req.Message, req.ContextType, 6_000); lb != "" {
		sb.WriteString("[AUTO_LEARNED_MEMORY]\n")
		sb.WriteString(lb)
		sb.WriteString("\n[/AUTO_LEARNED_MEMORY]\n\n")
	}
	sb.WriteString("[USER_REQUEST]\n")
	sb.WriteString(userReq)
	sb.WriteString("\n[/USER_REQUEST]\n")
	raw := truncateStr(sb.String(), cfg.EffectiveCodeStreamPromptCap())
	return ClampPromptForLocalProvider(cfg, PrepareLocalProviderPrompt(raw, EffectiveLocalPromptCap(cfg, req.ContextType, mode)), req.ContextType, mode)
}

func classifyLocalIntent(contextType, responseMode string) string {
	ctx := strings.ToLower(strings.TrimSpace(contextType))
	mode := strings.ToLower(strings.TrimSpace(responseMode))
	if ctx == "menu_json" {
		if mode == "analyze" {
			return "quick_question"
		}
		return "menu_json"
	}
	if ctx == "code" || ctx == "frontend_code" {
		if mode == "analyze" {
			return "quick_question"
		}
		return "frontend_code"
	}
	if mode == "edit" {
		return "frontend_code"
	}
	return "quick_question"
}

func loadAppContextBlock(cfg config.AppConfig, appID string, maxChars int) string {
	for _, name := range []string{
		appID + "_context.txt",
		"ai_context_" + appID + ".md",
	} {
		path := cfg.AI.ContextDir + "/" + name
		data, err := os.ReadFile(path)
		if err == nil && len(data) > 0 {
			return truncateStr(string(data), maxChars)
		}
	}
	return ""
}

func buildPromptLanguageBlock(uiLang, userRequest string) string {
	lang := "vi"
	switch strings.ToLower(uiLang) {
	case "en":
		lang = "en"
	case "zh", "zh-cn", "zh-tw":
		lang = "zh"
	}
	_ = userRequest
	return "[LANGUAGE]\nRespond primarily in: " + lang + "\n[/LANGUAGE]\n\n"
}

func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

// PrepareLocalProviderPrompt mirrors Rust/Java: Qwen chat models need the assistant turn marker.
func PrepareLocalProviderPrompt(prompt string, maxChars int) string {
	prepared := strings.TrimSpace(prompt)
	if prepared == "" {
		return prepared
	}
	if len(prepared) > maxChars {
		prepared = truncateStr(prepared, maxChars)
	}
	if !strings.Contains(prepared, "<|im_start|>assistant") {
		prepared += "\n\n<|im_start|>assistant\n"
	}
	return prepared
}

// CleanLocalModelOutput strips chat-template tokens leaked into model output.
func CleanLocalModelOutput(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return s
	}
	if idx := strings.LastIndex(s, "<|im_start|>assistant"); idx >= 0 {
		s = strings.TrimSpace(s[idx+len("<|im_start|>assistant"):])
	}
	s = strings.ReplaceAll(s, "<|im_start|>", "")
	if idx := strings.Index(s, "<|im_start|>"); idx >= 0 {
		s = strings.TrimSpace(s[:idx])
	}
	return strings.TrimSpace(s)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	if len(vals) > 0 {
		return vals[len(vals)-1]
	}
	return ""
}

func newRequestID() string {
	return fmtRequestID()
}

const (
	baseSystemMin = `You are CSM AI Assistant.
Follow the requested output contract exactly.
Return only valid JSON without markdown or explanation unless explicitly asked.
End immediately after the response.
`
	baseSystemAnalyzeMin = `You are CSM AI Assistant.
Follow the requested output contract exactly.
Answer in plain text prose unless the contract explicitly requires JSON.
Never repeat internal blocks such as BUSINESS_CONTEXT, BUSINESS_COMPREHENSION, Steps, or Output contract.
End immediately after the response.
`
	quickQuestionContract = `You are CSM AI Assistant.
Answer the user's question directly in the same language as the user request (Vietnamese, English, or Chinese).
For code/debug questions: cite concrete symbols (functions, variables, timers, webview/process lifecycle).
Use at least 4 short bullet points covering: observed behavior, likely root cause, relevant code paths, suggested fix/check.
Do not output a single "reason:" line or JSON patch envelope.
No JSON unless the user explicitly asked for a patch.
No markdown code fences.
No random text.
End immediately after the answer.
`
	frontendCodeContract = `You are CSM Frontend Code Editor.
Return ONLY valid JSON textEdits in edit mode:
{"summary":"","changes":[],"textEdits":[]}
Rules:
- startLine/endLine are 1-based line numbers in the FULL active editor file.
- action is add/edit/delete.
- For DynamicCode runtime: no import/export/require/module.exports.
`
)

func fmtRequestID() string {
	return strings.ReplaceAll(strings.TrimSpace(os.Getenv("HOSTNAME")), " ", "") + "-" + randomSuffix()
}

func randomSuffix() string {
	return fmt.Sprintf("%d", timeNowMs())
}

func timeNowMs() int64 {
	return nowMs()
}
