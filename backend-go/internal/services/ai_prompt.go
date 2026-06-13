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
		CurrentCode:  truncateStr(paramString(params, "currentCode", ""), 500_000),
		Language:     paramString(params, "language", "javascript"),
		Model:        paramString(params, "model", "auto"),
		UILang:       firstNonEmpty(paramString(params, "uiLang", ""), paramString(params, "ui_lang", ""), paramString(params, "uiLanguage", "vi")),
		ResponseMode: firstNonEmpty(paramString(params, "responseMode", ""), paramString(params, "response_mode", "")),
	}, ""
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
	mode := ResolveResponseMode(req)
	intent := classifyLocalIntent(req.ContextType, mode)
	editor := truncateStr(req.CurrentCode, 22_000)
	userReq := truncateStr(req.Message, 32_000)

	baseSystem := baseSystemMin
	if intent == "quick_question" {
		baseSystem = baseSystemAnalyzeMin
	}
	contract := frontendCodeContract
	switch intent {
	case "menu_json":
		if isEffectivelyEmptyMenuEditor(editor) {
			contract = menuGreenfieldContract
		} else {
			contract = menuJsonContract
		}
	case "quick_question":
		contract = quickQuestionContract
	}

	var sb strings.Builder
	sb.WriteString(baseSystem)
	sb.WriteString("\n\n")
	sb.WriteString(buildPromptLanguageBlock(req.UILang, userReq))
	sb.WriteString(contract)
	sb.WriteByte('\n')

	switch intent {
	case "menu_json":
		if isEffectivelyEmptyMenuEditor(editor) {
			sb.WriteString("[GREENFIELD_EMPTY_MENU]\n")
		} else if editor != "" {
			sb.WriteString("[ACTIVE_EDITOR_MENU_JSON]\n")
			sb.WriteString(editor)
			sb.WriteString("\n[/ACTIVE_EDITOR_MENU_JSON]\n\n")
		}
	case "frontend_code":
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
	sb.WriteString("[USER_REQUEST]\n")
	sb.WriteString(userReq)
	sb.WriteString("\n[/USER_REQUEST]\n")
	return truncateStr(sb.String(), cfg.EffectiveCodeStreamPromptCap())
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

func isEffectivelyEmptyMenuEditor(editor string) bool {
	s := strings.TrimSpace(editor)
	return s == "" || s == `{"menu":[]}` || s == `{"menu": []}`
}

func loadAppContextBlock(cfg config.AppConfig, appID string, maxChars int) string {
	path := cfg.AI.ContextDir + "/" + appID + "_context.txt"
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return truncateStr(string(data), maxChars)
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
End immediately after the response.
`
	quickQuestionContract = `You are CSM AI Assistant.
Answer the user's question directly in the same language as the user request.
Use concise bullet points when helpful.
No markdown code fences unless explicitly requested.
`
	frontendCodeContract = `You are CSM Frontend Code Editor.
Return ONLY valid JSON textEdits in edit mode:
{"summary":"","changes":[],"textEdits":[]}
Rules:
- startLine/endLine are 1-based line numbers in the FULL active editor file.
- action is add/edit/delete.
- For DynamicCode runtime: no import/export/require/module.exports.
`
	menuJsonContract = `[MENU_JSON_CONTRACT]
Return ONLY one JSON object with keys menu, notes, warnings.
No markdown fences, no prose before/after JSON.
[/MENU_JSON_CONTRACT]
`
	menuGreenfieldContract = `[GREENFIELD_EMPTY_MENU]
Current menu is EMPTY. Return ONLY one JSON object: { "menu": [ ...complete tree... ], "notes": [], "warnings": [] }
[/GREENFIELD_EMPTY_MENU]
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
