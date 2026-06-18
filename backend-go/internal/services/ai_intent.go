package services

import (
	"strings"
)

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
		return LocalIntentClassification{
			Type: "GENERAL", Action: "other", Confidence: 40,
			NextStep: "answer_direct", ContextKind: "none", ResponseMode: "analyze",
			Reasoning: "Fallback (LLM router offline): không có editor — mặc định analyze.",
		}
	}
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
	if mode := normalizeResponseMode(req.ResponseMode); mode != "" {
		return mode
	}
	if mode := normalizeResponseMode(intent.ResponseMode); mode != "" {
		return mode
	}
	return defaultResponseModeForContext(req.ContextType)
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
	return map[string]any{
		"stage":            "routing",
		"status":           "resolved",
		"requestId":        req.RequestID,
		"responseMode":     responseMode,
		"intentType":       intent.Type,
		"intentConfidence": intent.Confidence,
		"message":          routeMsg,
		"router":           intentRouterLabel(intent),
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
