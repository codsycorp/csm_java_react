package services

import (
	"fmt"
	"os"
	"strings"

	"csm_server/backend-go/internal/config"
)

type CodeStreamRequest struct {
	RequestID                string
	AppID                    string
	FlowType                 string
	TaskType                 string
	UserID                   string
	ContextType              string
	Message                  string
	CurrentCode              string
	TargetPName              string
	TargetPType              string
	FullCurrentCode          string // raw editor payload before tier cap (map-reduce source)
	FullCurrentCodeOrigLen   int
	FullCurrentCodeTruncated bool
	Language                 string
	Model                    string
	UILang                   string
	ResponseMode             string
	EditorMetadata           map[string]any
}

const (
	fullCurrentCodeMaxCharsMenuJSON = 2_000_000
	fullCurrentCodeMaxCharsDefault  = 500_000
)

func maxFullCurrentCodeChars(contextType string) int {
	if strings.ToLower(strings.TrimSpace(contextType)) == "menu_json" {
		return fullCurrentCodeMaxCharsMenuJSON
	}
	return fullCurrentCodeMaxCharsDefault
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
	rawCode := paramString(params, "currentCode", "")
	fullCode := paramString(params, "fullCurrentCode", "")
	if fullCode == "" {
		fullCode = rawCode
	}
	fullOrigLen := len(fullCode)
	fullCap := maxFullCurrentCodeChars(contextType)
	editorMeta := parseEditorMetadata(params)
	targetPName, targetPType := resolveCodeTarget(params, editorMeta)
	return &CodeStreamRequest{
		RequestID:                requestID,
		AppID:                    appID,
		FlowType:                 flowType,
		TaskType:                 paramString(params, "taskType", "edit"),
		ContextType:              contextType,
		TargetPName:              targetPName,
		TargetPType:              targetPType,
		Message:                  truncateStr(paramString(params, "message", ""), 32_000),
		CurrentCode:              truncateStr(rawCode, maxOutgoingEditorFromParams(params)),
		FullCurrentCode:          truncateStr(fullCode, fullCap),
		FullCurrentCodeOrigLen:   fullOrigLen,
		FullCurrentCodeTruncated: fullOrigLen > fullCap,
		Language:                 paramString(params, "language", "javascript"),
		Model:                    paramString(params, "model", "auto"),
		UILang:                   firstNonEmpty(paramString(params, "uiLang", ""), paramString(params, "ui_lang", ""), paramString(params, "uiLanguage", "vi")),
		ResponseMode:             firstNonEmpty(paramString(params, "responseMode", ""), paramString(params, "response_mode", "")),
		EditorMetadata:           editorMeta,
	}, ""
}

func resolveCodeTarget(params map[string]any, editorMeta map[string]any) (string, string) {
	pName := firstNonEmpty(
		paramString(params, "pName", ""),
		paramString(params, "p_name", ""),
		paramString(params, "targetFile", ""),
		paramString(editorMeta, "pName", ""),
		paramString(editorMeta, "p_name", ""),
		paramString(editorMeta, "targetFile", ""),
		paramString(editorMeta, "fileKey", ""),
	)
	pType := firstNonEmpty(
		paramString(params, "pType", ""),
		paramString(params, "p_type", ""),
		paramString(editorMeta, "pType", ""),
		paramString(editorMeta, "p_type", ""),
		paramString(editorMeta, "targetType", ""),
	)
	return strings.TrimSpace(pName), strings.TrimSpace(pType)
}

func parseEditorMetadata(params map[string]any) map[string]any {
	raw, ok := params["editorMetadata"]
	if !ok || raw == nil {
		return nil
	}
	if m, ok := raw.(map[string]any); ok {
		return m
	}
	return nil
}

func IsLineItemsPdfImport(req *CodeStreamRequest) bool {
	if req == nil {
		return false
	}
	return editorMetadataSourceFromMap(req.EditorMetadata) == "LineItemsPdfImport"
}

func IsLineItemsPdfImportParams(params map[string]any) bool {
	return editorMetadataSource(params) == "LineItemsPdfImport"
}

func editorMetadataSourceFromMap(meta map[string]any) string {
	if meta == nil {
		return ""
	}
	return strings.TrimSpace(paramString(meta, "source", ""))
}

func maxOutgoingEditorFromParams(params map[string]any) int {
	ctxType := paramString(params, "contextType", "code")
	mode := inferResponseModeFromParams(params)
	return MaxOutgoingEditorChars(config.AppConfig{}, ctxType, mode)
}

func inferResponseModeFromParams(params map[string]any) string {
	rawMode := strings.ToLower(strings.TrimSpace(firstNonEmpty(paramString(params, "responseMode", ""), paramString(params, "response_mode", ""))))
	if mode := normalizeResponseMode(rawMode); mode != "" {
		return mode
	}
	// Frontend integrations may send legacy modes; normalize them into core lanes.
	switch rawMode {
	case "plan", "qa", "chat", "read", "review", "explain", "analysis":
		return "analyze"
	case "patch", "apply", "write", "modify", "update", "edit_code":
		return "edit"
	}

	taskType := strings.ToLower(strings.TrimSpace(paramString(params, "taskType", "")))
	switch taskType {
	case "seo_content", "media_script", "qa", "chat", "analysis", "business_qa", "explain":
		return "analyze"
	case "edit", "menu_edit", "code_edit", "apply_patch", "refactor":
		return "edit"
	}

	ctxType := strings.ToLower(strings.TrimSpace(paramString(params, "contextType", "code")))
	return defaultResponseModeForContext(ctxType)
}

func ResolveResponseMode(req *CodeStreamRequest) string {
	if req == nil {
		return "analyze"
	}
	if mode := normalizeResponseMode(req.ResponseMode); mode != "" {
		return mode
	}
	return defaultResponseModeForContext(req.ContextType)
}

func BuildCodeStreamLocalPrompt(cfg config.AppConfig, req *CodeStreamRequest) string {
	return BuildCodeStreamLocalPromptWithExtras(cfg, req, "", "", "")
}

func BuildCodeStreamLocalPromptWithExtras(cfg config.AppConfig, req *CodeStreamRequest, learningBlock, comprehendBlock, tenantRAGBlock string) string {
	return BuildCodeStreamLocalPromptFull(cfg, req, learningBlock, comprehendBlock, tenantRAGBlock, "", "")
}

func BuildCodeStreamLocalPromptFull(cfg config.AppConfig, req *CodeStreamRequest, learningBlock, comprehendBlock, tenantRAGBlock, multimodalBlock, workspaceBlock string) string {
	mode := ResolveResponseMode(req)
	printImport := IsLineItemsPdfImport(req)
	sessionMemoryCap := SessionMemoryBudget(cfg, req.ContextType, mode)
	intent := classifyLocalIntent(req.ContextType, mode)
	editorMax, ragMax, learningMax, workspaceMax := ConstrainedPromptSlotCaps(cfg)
	if isMenuJSONContext(req.ContextType) && mode == "edit" {
		editorMax = MaxOutgoingEditorChars(cfg, req.ContextType, mode)
	}
	if printImport {
		editorMax = 32_000
		if !IsConstrained8GbTier(cfg) {
			editorMax = 48_000
		}
		ragMax = 0
		learningMax = 0
		workspaceMax = 0
		comprehendBlock = ""
		tenantRAGBlock = ""
		workspaceBlock = ""
		multimodalBlock = ""
		learningBlock = ""
	}
	editor := truncateStr(req.CurrentCode, editorMax)
	userReq := truncateStr(req.Message, 32_000)
	if !printImport {
		learningBlock = truncateStr(learningBlock, learningMax)
		tenantRAGBlock = truncateStr(tenantRAGBlock, ragMax)
		workspaceBlock = truncateStr(workspaceBlock, workspaceMax)
		multimodalBlock = truncateStr(multimodalBlock, 3000)
	}

	baseSystem := baseSystemMin
	switch intent {
	case "quick_question":
		baseSystem = baseSystemAnalyzeMin
	case "raw_code":
		baseSystem = baseSystemRawCodeMin
	}
	var contract string
	if printImport {
		contract = printImportContract
	} else {
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
			if isMenuJSONContext(req.ContextType) {
				contract = menuJsonAnalyzeContract
			} else {
				contract = quickQuestionContract
			}
		case "raw_code":
			contract = rawCodeContract
		default:
			contract = frontendCodeContract
		}
	}

	var sb strings.Builder
	sb.WriteString(qwen15ExpertPersona)
	sb.WriteString(baseSystem)
	sb.WriteString("\n\n")
	sb.WriteString(buildPromptLanguageBlock(req.UILang, userReq))
	sb.WriteString(contract)
	sessionMemorySource := "none"
	sessionMemoryUsedChars := 0
	sb.WriteByte('\n')

	if printImport && editor != "" {
		sb.WriteString("[ACTIVE_EDITOR]\n")
		sb.WriteString(editor)
		sb.WriteString("\n[/ACTIVE_EDITOR]\n\n")
	} else {
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
			if isMenuJSONContext(req.ContextType) {
				if kb := BuildMenuKnowledgeBlock(cfg, 8000); kb != "" {
					sb.WriteString(kb)
					sb.WriteByte('\n')
				}
				if editor != "" {
					sb.WriteString("[ACTIVE_EDITOR_MENU_JSON]\n")
					sb.WriteString(editor)
					sb.WriteString("\n[/ACTIVE_EDITOR_MENU_JSON]\n\n")
				}
			} else if editor != "" && len(editor) <= 8_000 {
				sb.WriteString("[CONTEXT_SNIPPET]\n")
				sb.WriteString(editor)
				sb.WriteString("\n[/CONTEXT_SNIPPET]\n\n")
			}
		case "raw_code":
			if editor != "" {
				sb.WriteString("[CURRENT_CODE]\n")
				sb.WriteString(editor)
				sb.WriteString("\n[/CURRENT_CODE]\n\n")
			}
		}
	}

	if ctxBlock := conversationContextFromEditorMetadata(req.EditorMetadata, sessionMemoryCap); ctxBlock != "" && !printImport {
		sb.WriteString("[SESSION_MEMORY]\n")
		sb.WriteString(ctxBlock)
		sb.WriteString("\n[/SESSION_MEMORY]\n\n")
		sessionMemorySource = "scoped_editor_metadata"
		sessionMemoryUsedChars = len(ctxBlock)
	} else if ctxBlock := loadAppContextBlock(cfg, req.AppID, sessionMemoryCap); ctxBlock != "" && !printImport {
		sb.WriteString("[SESSION_MEMORY]\n")
		sb.WriteString(ctxBlock)
		sb.WriteString("\n[/SESSION_MEMORY]\n\n")
		sessionMemorySource = "app_context_fallback"
		sessionMemoryUsedChars = len(ctxBlock)
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
	if layoutBlock := BuildPrintImportLayoutBlock(req.EditorMetadata); layoutBlock != "" {
		sb.WriteString(layoutBlock)
	}
	if learningBlock != "" {
		sb.WriteString("[AUTO_LEARNED_MEMORY]\n")
		sb.WriteString(learningBlock)
		sb.WriteString("\n[/AUTO_LEARNED_MEMORY]\n\n")
	} else if !printImport {
		if lb := BuildLearningContextBlock(cfg, nil, req.AppID, req.Message, req.ContextType, 6_000); lb != "" {
			sb.WriteString("[AUTO_LEARNED_MEMORY]\n")
			sb.WriteString(lb)
			sb.WriteString("\n[/AUTO_LEARNED_MEMORY]\n\n")
		}
	}
	sb.WriteString("[USER_REQUEST]\n")
	sb.WriteString(userReq)
	sb.WriteString("\n[/USER_REQUEST]\n")
	if req.EditorMetadata == nil {
		req.EditorMetadata = map[string]any{}
	}
	req.EditorMetadata["__sessionMemorySource"] = sessionMemorySource
	req.EditorMetadata["__sessionMemoryCap"] = sessionMemoryCap
	req.EditorMetadata["__sessionMemoryUsedChars"] = sessionMemoryUsedChars
	raw := truncateStr(sb.String(), cfg.EffectiveCodeStreamPromptCap())
	promptCap := EffectiveLocalPromptCap(cfg, req.ContextType, mode)
	if printImport {
		promptCap = EffectiveLocalPromptCapForPrintImport(cfg)
	}
	return ClampPromptForLocalProvider(cfg, PrepareLocalProviderPrompt(raw, promptCap), req.ContextType, mode)
}

func isMenuJSONContext(contextType string) bool {
	return strings.ToLower(strings.TrimSpace(contextType)) == "menu_json"
}

func classifyLocalIntent(contextType, responseMode string) string {
	ctx := strings.ToLower(strings.TrimSpace(contextType))
	mode := strings.ToLower(strings.TrimSpace(responseMode))
	if mode == "raw_code" {
		return "raw_code"
	}
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

func conversationContextFromEditorMetadata(meta map[string]any, maxChars int) string {
	if meta == nil {
		return ""
	}
	raw, ok := meta["__conversationContext"]
	if !ok || raw == nil {
		return ""
	}
	text := strings.TrimSpace(fmt.Sprint(raw))
	if text == "" {
		return ""
	}
	return truncateStr(text, maxChars)
}

// SessionMemoryBudget returns adaptive chars for SESSION_MEMORY block.
// Priority: keep memory helpful without starving active editor/RAG on constrained machines.
func SessionMemoryBudget(cfg config.AppConfig, contextType, responseMode string) int {
	mode := strings.ToLower(strings.TrimSpace(responseMode))
	ctx := strings.ToLower(strings.TrimSpace(contextType))
	promptCap := EffectiveLocalPromptCap(cfg, ctx, mode)
	if promptCap <= 0 {
		promptCap = 12000
	}

	budget := promptCap / 6
	if mode == "analyze" && ctx != "menu_json" {
		budget = promptCap / 8
	}
	if mode == "edit" && ctx == "menu_json" {
		budget = promptCap / 5
	}

	if IsConstrained8GbTier(cfg) {
		if budget > 2200 {
			budget = 2200
		}
	}
	if budget < 1200 {
		budget = 1200
	}
	if budget > 8000 {
		budget = 8000
	}
	return budget
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
	qwen15ExpertPersona = `You are a local qwen2.5-coder-1.5b reasoning core for CSM.
You specialize in programming across many languages, business workflows, and customer-specific domain rules.
Think carefully, stay local-first, and keep memory use low for 8GB RAM / 4 CPU machines.
Reason privately; do not reveal hidden chain-of-thought.
Prefer concise, deterministic answers and ask for missing facts when needed.
`
	baseSystemMin = `You are CSM AI Assistant.
Follow the requested output contract exactly.
Return only valid JSON without markdown or explanation unless explicitly asked.
End immediately after the response.
`
	baseSystemAnalyzeMin = qwen15ExpertPersona + `You are CSM AI Assistant.
Follow the requested output contract exactly.
Answer in plain text prose unless the contract explicitly requires JSON.
Never repeat internal blocks such as BUSINESS_CONTEXT, BUSINESS_COMPREHENSION, Steps, or Output contract.
Never fabricate sources, URLs, or "latest news" claims.
If evidence in [TENANT_RAG]/workspace is insufficient for time-sensitive claims, say so explicitly and ask user to provide links/data.
End immediately after the response.
`
	baseSystemRawCodeMin = qwen15ExpertPersona + `You are CSM Code Generator.
Follow the requested output contract exactly.
Return ONLY raw source code — nothing else.
End immediately after the last line of code.
`
	rawCodeContract = `Return ONLY raw source code.
No markdown fences (no ` + "```" + `). No JSON wrapper. No explanations.
Start with the very first line of code and end with the last line.
`
	quickQuestionContract = qwen15ExpertPersona + `You are CSM AI Assistant.
Answer the user's question directly in the same language as the user request (Vietnamese, English, or Chinese).
For code/debug questions: cite concrete symbols (functions, variables, timers, webview/process lifecycle).
If the user asks for latest news/reliable sources: only cite sources that are explicitly present in provided context; otherwise state limitation and avoid invented source names.
Use at least 4 short bullet points covering: observed behavior, likely root cause, relevant code paths, suggested fix/check.
Do not output a single "reason:" line or JSON patch envelope.
No JSON unless the user explicitly asked for a patch.
No markdown code fences.
No random text.
End immediately after the answer.
`
	menuJsonAnalyzeContract = qwen15ExpertPersona + `You are CSM Menu JSON Analyst.
Answer about ACTIVE_EDITOR_MENU_JSON in the user's language (Vietnamese unless they wrote English/Chinese).
Never refuse — always analyze the provided menu JSON and explain what you find.
Column headers / i18n: check f_header (Vietnamese), f_header_en, f_header_zh on each field in trigger.fields.
If Vietnamese UI shows English: fields often lack f_header or only have f_header_en populated.
f_types="co" (combo/select): values come from f_cbo_query and/or f_cbo_list — if both missing/empty, combo shows no options.
f_types="coro" is read-only combo; still needs f_cbo_query or f_cbo_list for display values.
Use at least 4 bullet points: affected fields (f_name), observed JSON keys, root cause, concrete fix (which keys to add/change).
Do NOT output JSON patches unless the user explicitly asked to fix/edit the menu.
No markdown code fences.
End immediately after the answer.
`
	frontendCodeContract = qwen15ExpertPersona + `You are CSM Frontend Code Editor.
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
