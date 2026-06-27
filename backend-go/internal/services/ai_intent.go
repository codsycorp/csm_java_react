package services

import (
	"strings"
	"unicode/utf8"
)

type routingDecision struct {
	mode                 string
	overrideExplicitEdit bool
	editScore            float64
	analyzeScore         float64
	margin               float64
	signalBalance        int
}

// LocalIntentClassification mirrors Java LocalIntentClassification (AI#1 router).
type LocalIntentClassification struct {
	Type         string // EDIT_MENU, EDIT_CODE, QUESTION, GENERAL
	Action       string // add, modify, delete, ask, search, other
	Confidence   int
	NextStep     string // answer_direct, load_menu_context, load_code_context, clarify, unknown
	ContextKind  string // menu, code, none
	ResponseMode string // edit, analyze
	Reasoning    string
}

// ClassifyIntentHeuristic is a minimal fallback when the local LLM router is unavailable.
// It does not keyword-match the user message — only editor context + explicit client mode.
func ClassifyIntentHeuristic(req *CodeStreamRequest) LocalIntentClassification {
	return classifyIntentContextFallback(req)
}

func classifyIntentContextFallback(req *CodeStreamRequest) LocalIntentClassification {
	if req == nil || strings.TrimSpace(req.Message) == "" {
		return unknownIntent("Empty user request")
	}
	if mode := normalizeResponseMode(req.ResponseMode); mode != "" {
		return intentFromExplicitMode(req, mode)
	}
	ctx := strings.ToLower(strings.TrimSpace(req.ContextType))
	if ctx == "" || ctx == "none" {
		if shouldFallbackToAnalyzeQuestion(req.Message) {
			return LocalIntentClassification{
				Type: "QUESTION", Action: "ask", Confidence: 48,
				NextStep: "answer_direct", ContextKind: "none", ResponseMode: "analyze",
				Reasoning: "Fallback (LLM router offline): không có editor context + câu hỏi — trả lời trực tiếp (analyze).",
			}
		}
	}
	switch ctx {
	case "menu_json":
		return LocalIntentClassification{
			Type: "EDIT_MENU", Action: "modify", Confidence: 45,
			NextStep: "load_menu_context", ContextKind: "menu", ResponseMode: "edit",
			Reasoning: "Fallback (LLM router offline): editor menu_json — mặc định edit.",
		}
	case "code", "frontend_code":
		return LocalIntentClassification{
			Type: "EDIT_CODE", Action: "modify", Confidence: 45,
			NextStep: "load_code_context", ContextKind: "code", ResponseMode: "edit",
			Reasoning: "Fallback (LLM router offline): editor code — mặc định edit.",
		}
	default:
		if shouldFallbackToAnalyzeQuestion(req.Message) {
			return LocalIntentClassification{
				Type: "QUESTION", Action: "ask", Confidence: 48,
				NextStep: "answer_direct", ContextKind: "none", ResponseMode: "analyze",
				Reasoning: "Fallback (LLM router offline): câu hỏi không có context rõ — mặc định analyze.",
			}
		}
		return LocalIntentClassification{
			Type: "GENERAL", Action: "other", Confidence: 40,
			NextStep: "answer_direct", ContextKind: "none", ResponseMode: "analyze",
			Reasoning: "Fallback (LLM router offline): không có editor — mặc định analyze.",
		}
	}
}

func shouldFallbackToAnalyzeQuestion(message string) bool {
	msg := strings.ToLower(strings.TrimSpace(message))
	if msg == "" {
		return false
	}
	if utf8.RuneCountInString(msg) < 3 {
		return false
	}
	if !strings.Contains(msg, "?") && !strings.Contains(msg, "？") {
		return false
	}
	if utf8.RuneCountInString(msg) > 280 {
		return false
	}
	return true
}

func intentFromExplicitMode(req *CodeStreamRequest, mode string) LocalIntentClassification {
	ctx := strings.ToLower(strings.TrimSpace(req.ContextType))
	switch ctx {
	case "menu_json":
		return LocalIntentClassification{
			Type: "EDIT_MENU", Action: "modify", Confidence: 95,
			NextStep: "load_menu_context", ContextKind: "menu", ResponseMode: mode,
			Reasoning: "Client chỉ định responseMode=" + mode + " trong editor menu.",
		}
	case "code", "frontend_code":
		return LocalIntentClassification{
			Type: "EDIT_CODE", Action: "modify", Confidence: 95,
			NextStep: "load_code_context", ContextKind: "code", ResponseMode: mode,
			Reasoning: "Client chỉ định responseMode=" + mode + " trong editor code.",
		}
	default:
		typ := "QUESTION"
		if mode == "edit" {
			typ = "GENERAL"
		}
		return LocalIntentClassification{
			Type: typ, Action: "other", Confidence: 90,
			NextStep: "answer_direct", ContextKind: "none", ResponseMode: mode,
			Reasoning: "Client chỉ định responseMode=" + mode + ".",
		}
	}
}

// ResolvePipelineResponseMode picks the stream mode: client explicit > LLM intent > context default.
func ResolvePipelineResponseMode(req *CodeStreamRequest, intent LocalIntentClassification) string {
	explicitMode := normalizeResponseMode(req.ResponseMode)
	if explicitMode == "analyze" {
		return "analyze"
	}
	if explicitMode == "edit" {
		if shouldOverrideExplicitEditWithIntent(req, intent) {
			return "analyze"
		}
		return "edit"
	}
	return resolveIntentDrivenMode(req, intent)
}

func resolveIntentDrivenMode(req *CodeStreamRequest, intent LocalIntentClassification) string {
	if shouldPreferAnalyzeByContent(req, intent) {
		return "analyze"
	}
	decision := evaluateRoutingDecision(req, intent, false)
	return decision.mode
}

func shouldOverrideExplicitEditWithIntent(req *CodeStreamRequest, intent LocalIntentClassification) bool {
	if shouldPreferAnalyzeByContent(req, intent) {
		return true
	}
	if clampIntentConfidence(intent.Confidence) < 65 {
		return false
	}
	decision := evaluateRoutingDecision(req, intent, true)
	return decision.overrideExplicitEdit
}

func shouldPreferAnalyzeByContent(req *CodeStreamRequest, intent LocalIntentClassification) bool {
	if req == nil {
		return false
	}
	msg := strings.TrimSpace(req.Message)
	if msg == "" || utf8.RuneCountInString(msg) > 1600 {
		return false
	}
	weakLink := isWeaklyLinkedToEditorContent(msg, req.CurrentCode)
	if !weakLink {
		return false
	}
	if shouldForceAnalyzeBySemanticDistance(msg, intent) {
		return true
	}
	if isStrongEditIntent(intent) {
		return false
	}
	if normalizeResponseMode(intent.ResponseMode) == "analyze" {
		return true
	}
	typ := strings.ToUpper(strings.TrimSpace(intent.Type))
	action := strings.ToLower(strings.TrimSpace(intent.Action))
	next := strings.ToLower(strings.TrimSpace(intent.NextStep))
	if typ == "QUESTION" || typ == "GENERAL" {
		return true
	}
	if action == "ask" || action == "search" || next == "answer_direct" {
		return true
	}
	if clampIntentConfidence(intent.Confidence) < 85 {
		return true
	}
	return shouldFallbackToAnalyzeQuestion(msg)
}

func shouldForceAnalyzeBySemanticDistance(message string, intent LocalIntentClassification) bool {
	typ := strings.ToUpper(strings.TrimSpace(intent.Type))
	action := strings.ToLower(strings.TrimSpace(intent.Action))
	next := strings.ToLower(strings.TrimSpace(intent.NextStep))
	if !shouldFallbackToAnalyzeQuestion(message) {
		return false
	}
	if messageHasCodeLikeSyntax(message) {
		return false
	}
	if next == "load_code_context" || next == "load_menu_context" {
		if clampIntentConfidence(intent.Confidence) >= 97 && (typ == "EDIT_CODE" || typ == "EDIT_MENU") && (action == "add" || action == "modify" || action == "delete") {
			return false
		}
	}
	return true
}

func isStrongEditIntent(intent LocalIntentClassification) bool {
	typ := strings.ToUpper(strings.TrimSpace(intent.Type))
	action := strings.ToLower(strings.TrimSpace(intent.Action))
	next := strings.ToLower(strings.TrimSpace(intent.NextStep))
	if clampIntentConfidence(intent.Confidence) < 85 {
		return false
	}
	if typ != "EDIT_CODE" && typ != "EDIT_MENU" {
		return false
	}
	if action != "add" && action != "modify" && action != "delete" {
		return false
	}
	if next != "load_code_context" && next != "load_menu_context" {
		return false
	}
	return true
}

func isWeaklyLinkedToEditorContent(message, currentCode string) bool {
	msg := strings.TrimSpace(message)
	if msg == "" {
		return true
	}
	if messageHasCodeLikeSyntax(msg) {
		return false
	}
	symbols := extractCodeSymbols(currentCode)
	if len(symbols) == 0 {
		return true
	}
	overlap := countMessageSymbolOverlap(msg, symbols)
	if overlap == 0 {
		return true
	}
	msgTokenCount := len(strings.Fields(strings.ToLower(strings.NewReplacer(",", " ", ".", " ", ":", " ", ";", " ", "\n", " ", "\t", " ", "\r", " ").Replace(msg))))
	if msgTokenCount >= 10 && overlap <= 1 {
		return true
	}
	return false
}

func countMessageSymbolOverlap(message string, symbols []string) int {
	if len(symbols) == 0 {
		return 0
	}
	msgTokens := strings.Fields(strings.ToLower(strings.NewReplacer(
		",", " ", ".", " ", ":", " ", ";", " ", "(", " ", ")", " ", "[", " ", "]", " ", "{", " ", "}", " ",
		"\n", " ", "\t", " ", "\r", " ", "\"", " ", "'", " ", "`", " ", "?", " ", "!", " ",
	).Replace(message)))
	if len(msgTokens) == 0 {
		return 0
	}
	msgSet := map[string]struct{}{}
	for _, t := range msgTokens {
		if len(t) < 2 {
			continue
		}
		msgSet[t] = struct{}{}
	}
	hits := 0
	seen := map[string]struct{}{}
	for _, sym := range symbols {
		s := strings.ToLower(strings.TrimSpace(sym))
		if len(s) < 3 {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		if _, ok := msgSet[s]; ok {
			hits++
			seen[s] = struct{}{}
		}
	}
	return hits
}

func messageHasCodeLikeSyntax(message string) bool {
	msg := strings.TrimSpace(message)
	if msg == "" {
		return false
	}
	if strings.Contains(msg, "=>") || strings.Contains(msg, "::") || strings.Contains(msg, "==") {
		return true
	}
	if strings.ContainsAny(msg, "{}[];") {
		return true
	}
	if strings.Contains(msg, "(") && strings.Contains(msg, ")") {
		return true
	}
	if strings.Contains(msg, "`") {
		return true
	}
	return false
}

func evaluateRoutingDecision(req *CodeStreamRequest, intent LocalIntentClassification, explicitEdit bool) routingDecision {
	editScore, analyzeScore, signalBalance := intentRoutingScores(req, intent)
	decision := routingDecision{
		mode:          defaultResponseModeForContext(req.ContextType),
		editScore:     editScore,
		analyzeScore:  analyzeScore,
		signalBalance: signalBalance,
	}
	margin := adaptiveAnalyzeMargin(req, intent, explicitEdit, signalBalance)
	decision.margin = margin
	delta := analyzeScore - editScore
	if explicitEdit {
		decision.mode = "edit"
		decision.overrideExplicitEdit = normalizeResponseMode(intent.ResponseMode) == "analyze" && delta >= margin
		if decision.overrideExplicitEdit {
			decision.mode = "analyze"
		}
		return decision
	}
	if delta > 0 {
		decision.mode = "analyze"
	} else if delta < 0 {
		decision.mode = "edit"
	}
	if delta > -0.01 && delta < 0.01 {
		if mode := normalizeResponseMode(intent.ResponseMode); mode != "" {
			decision.mode = mode
		}
	}
	return decision
}

func intentRoutingScores(req *CodeStreamRequest, intent LocalIntentClassification) (float64, float64, int) {
	editScore := 0.0
	analyzeScore := 0.0
	signalBalance := 0
	contextType := strings.ToLower(strings.TrimSpace(req.ContextType))
	switch contextType {
	case "menu_json", "code", "frontend_code":
		editScore += 1.2
		signalBalance--
	default:
		analyzeScore += 1.2
		signalBalance++
	}
	confFactor := float64(clampIntentConfidence(intent.Confidence)) / 100.0
	if confFactor == 0 {
		confFactor = 0.35
	}
	if mode := normalizeResponseMode(intent.ResponseMode); mode == "edit" {
		editScore += 1.8 * confFactor
		signalBalance--
	} else if mode == "analyze" {
		analyzeScore += 1.8 * confFactor
		signalBalance++
	}
	switch strings.ToLower(strings.TrimSpace(intent.NextStep)) {
	case "answer_direct":
		analyzeScore += 1.4 * confFactor
		signalBalance++
	case "load_code_context", "load_menu_context":
		editScore += 1.4 * confFactor
		signalBalance--
	}
	switch strings.ToUpper(strings.TrimSpace(intent.Type)) {
	case "QUESTION", "GENERAL":
		analyzeScore += 0.8 * confFactor
		signalBalance++
	case "EDIT_CODE", "EDIT_MENU":
		editScore += 0.8 * confFactor
		signalBalance--
	}
	switch strings.ToLower(strings.TrimSpace(intent.Action)) {
	case "ask", "search":
		analyzeScore += 0.6 * confFactor
		signalBalance++
	case "add", "modify", "delete":
		editScore += 0.6 * confFactor
		signalBalance--
	}
	switch strings.ToLower(strings.TrimSpace(intent.ContextKind)) {
	case "menu", "code":
		editScore += 0.6 * confFactor
		signalBalance--
	case "none":
		analyzeScore += 0.6 * confFactor
		signalBalance++
	}
	return editScore, analyzeScore, signalBalance
}

func adaptiveAnalyzeMargin(req *CodeStreamRequest, intent LocalIntentClassification, explicitEdit bool, signalBalance int) float64 {
	margin := 0.95
	if explicitEdit {
		margin += 0.25
	}
	contextType := strings.ToLower(strings.TrimSpace(req.ContextType))
	if contextType == "code" || contextType == "frontend_code" || contextType == "menu_json" {
		margin += 0.1
	}
	conf := clampIntentConfidence(intent.Confidence)
	if conf >= 90 {
		margin -= 0.2
	} else if conf <= 55 {
		margin += 0.15
	}
	if strings.ToLower(strings.TrimSpace(intent.NextStep)) == "answer_direct" {
		margin -= 0.1
	}
	if signalBalance >= 3 {
		margin -= 0.15
	} else if signalBalance <= -3 {
		margin += 0.15
	}
	messageRunes := utf8.RuneCountInString(strings.TrimSpace(req.Message))
	if messageRunes > 260 {
		margin += 0.1
	}
	if margin < 0.45 {
		return 0.45
	}
	if margin > 1.6 {
		return 1.6
	}
	return margin
}

func clampIntentConfidence(conf int) int {
	if conf < 0 {
		return 0
	}
	if conf > 100 {
		return 100
	}
	return conf
}

// ReconcileResponseModeWithIntent is kept for callers; delegates to ResolvePipelineResponseMode.
func ReconcileResponseModeWithIntent(intent LocalIntentClassification, explicitMode string) string {
	req := &CodeStreamRequest{ResponseMode: explicitMode}
	return ResolvePipelineResponseMode(req, intent)
}

func normalizeResponseMode(mode string) string {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode == "edit" || mode == "analyze" {
		return mode
	}
	return ""
}

func defaultResponseModeForContext(contextType string) string {
	switch strings.ToLower(strings.TrimSpace(contextType)) {
	case "menu_json", "code", "frontend_code":
		return "edit"
	default:
		return "analyze"
	}
}

func unknownIntent(reason string) LocalIntentClassification {
	return LocalIntentClassification{
		Type: "GENERAL", Action: "other", Confidence: 0,
		NextStep: "unknown", ContextKind: "none", ResponseMode: "analyze",
		Reasoning: reason,
	}
}

// IntentReasoningSSE builds the intent_reasoning SSE payload.
func IntentReasoningSSE(req *CodeStreamRequest, intent LocalIntentClassification, responseMode string) map[string]any {
	obs := "Không có editor code/menu"
	switch strings.ToLower(req.ContextType) {
	case "menu_json":
		obs = "Editor đang mở JSON menu (menu_json)"
	case "code", "frontend_code":
		obs = "Editor đang mở mã nguồn (code)"
	}
	reasoning := strings.TrimSpace(intent.Reasoning)
	msg := reasoning
	if msg == "" {
		msg = "Observation → Action: " + responseMode
	}
	return map[string]any{
		"stage":            "intent_reasoning",
		"status":           "resolved",
		"requestId":        req.RequestID,
		"observation":      obs,
		"reasoning":        reasoning,
		"action":           responseMode,
		"intentType":       intent.Type,
		"intentConfidence": intent.Confidence,
		"message":          msg,
		"router":           intentRouterLabel(intent),
	}
}

// IntentRoutingSSE builds the routing SSE payload.
func IntentRoutingSSE(req *CodeStreamRequest, intent LocalIntentClassification, responseMode string) map[string]any {
	routeMsg := "Luồng analyze: trả lời prose (stream)"
	if responseMode == "edit" {
		routeMsg = "Luồng edit: patch JSON → CodeMirror"
	}
	explicitEdit := normalizeResponseMode(req.ResponseMode) == "edit"
	decision := evaluateRoutingDecision(req, intent, explicitEdit)
	return map[string]any{
		"stage":            "routing",
		"status":           "resolved",
		"requestId":        req.RequestID,
		"responseMode":     responseMode,
		"intentType":       intent.Type,
		"intentConfidence": intent.Confidence,
		"routingScores": map[string]any{
			"edit":           decision.editScore,
			"analyze":        decision.analyzeScore,
			"adaptiveMargin": decision.margin,
			"signalBalance":  decision.signalBalance,
			"explicitEdit":   explicitEdit,
			"override":       decision.overrideExplicitEdit,
		},
		"message": routeMsg,
		"router":  intentRouterLabel(intent),
	}
}

func intentRouterLabel(intent LocalIntentClassification) string {
	if intent.Confidence >= 60 {
		return "local_llm"
	}
	if intent.Confidence > 0 {
		return "context_fallback"
	}
	return "unknown"
}

// ShouldQuickReply mirrors Java planner_fast quick-reply behavior for non code/menu intents.
func ShouldQuickReply(intent LocalIntentClassification, responseMode string) bool {
	if normalizeResponseMode(responseMode) != "analyze" {
		return false
	}
	next := strings.ToLower(strings.TrimSpace(intent.NextStep))
	if next == "answer_direct" {
		return true
	}
	if next == "load_code_context" || next == "load_menu_context" {
		return false
	}
	typ := strings.ToUpper(strings.TrimSpace(intent.Type))
	kind := strings.ToLower(strings.TrimSpace(intent.ContextKind))
	if (typ == "QUESTION" || typ == "GENERAL") && kind == "none" {
		return true
	}
	return false
}
