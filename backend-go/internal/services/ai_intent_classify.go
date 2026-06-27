package services

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type intentClassifyCacheEntry struct {
	intent   LocalIntentClassification
	cachedAt time.Time
}

var (
	intentClassifyCache    sync.Map
	intentClassifyCacheTTL = 45 * time.Second
)

func intentClassifyEnabled() bool {
	v := strings.TrimSpace(os.Getenv("AI_LOCAL_INTENT_CLASSIFY_ENABLED"))
	if v == "" {
		return true
	}
	switch strings.ToLower(v) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func intentClassifyMaxTokens(message string) uint32 {
	if v := strings.TrimSpace(os.Getenv("AI_LOCAL_INTENT_CLASSIFY_MAX_TOKENS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 32 && n <= 512 {
			return uint32(n)
		}
	}
	if len(strings.TrimSpace(message)) > 240 {
		return 192
	}
	return 128
}

// ClassifyIntent routes via local LLM when available; falls back to heuristics.
func ClassifyIntent(ctx context.Context, llama *LlamaService, req *CodeStreamRequest) LocalIntentClassification {
	if req == nil || strings.TrimSpace(req.Message) == "" {
		return unknownIntent("Empty user request")
	}
	if shouldFallbackToAnalyzeQuestion(req.Message) {
		return LocalIntentClassification{
			Type: "QUESTION", Action: "ask", Confidence: 92,
			NextStep: "answer_direct", ContextKind: "none", ResponseMode: "analyze",
			Reasoning: "Conversational fast-path: skip heavy edit pipeline and answer directly.",
		}
	}
	if llama != nil && llama.IsAvailable() && intentClassifyEnabled() {
		if classified := ClassifyIntentWithLocalAI(ctx, llama, req); classified.Confidence > 0 {
			return classified
		}
	}
	return ClassifyIntentHeuristic(req)
}

// ClassifyIntentWithLocalAI uses a short local LLM call (Java classifyIntentWithLocalAI parity).
func ClassifyIntentWithLocalAI(ctx context.Context, llama *LlamaService, req *CodeStreamRequest) LocalIntentClassification {
	if llama == nil || !llama.IsAvailable() || req == nil {
		return unknownIntent("LLM unavailable")
	}
	msg := TruncateMiddle(strings.TrimSpace(req.Message), intentClassifyMaxRequestChars())
	if msg == "" {
		return unknownIntent("Empty user request")
	}
	cacheKey := msg
	if len(cacheKey) > 120 {
		cacheKey = cacheKey[:120]
	}
	if hit, ok := intentClassifyCache.Load(cacheKey); ok {
		entry := hit.(intentClassifyCacheEntry)
		if time.Since(entry.cachedAt) < intentClassifyCacheTTL {
			return entry.intent
		}
		intentClassifyCache.Delete(cacheKey)
	}

	prompt := buildIntentClassifyPrompt(req, msg)
	callCtx := ctx
	if callCtx == nil {
		callCtx = context.Background()
	}
	timeoutCtx, cancel := context.WithTimeout(callCtx, 25*time.Second)
	defer cancel()

	raw, err := llama.CompleteWithTokens(timeoutCtx, prompt, intentClassifyMaxTokens(msg))
	if err != nil {
		log.Printf("[AI_INTENT_CLASSIFY] inference failed: %v", err)
		return unknownIntent("intent classify inference failed")
	}
	parsed := parseIntentClassifyJSON(CleanLocalModelOutput(raw))
	if parsed.Confidence <= 0 {
		return unknownIntent("intent classify parse failed")
	}
	parsed = postGuardIntentClassification(parsed, req, msg)
	intentClassifyCache.Store(cacheKey, intentClassifyCacheEntry{intent: parsed, cachedAt: time.Now()})
	return parsed
}

func intentClassifyMaxRequestChars() int {
	if v := strings.TrimSpace(os.Getenv("AI_LOCAL_INTENT_CLASSIFY_MAX_REQUEST_CHARS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 80 {
			return n
		}
	}
	return 480
}

func buildIntentClassifyPrompt(req *CodeStreamRequest, message string) string {
	editorContext := "none (no code/menu editor)"
	switch strings.ToLower(strings.TrimSpace(req.ContextType)) {
	case "menu_json":
		editorContext = "menu_json (user is editing CSM menu JSON in CodeMirror)"
	case "code", "frontend_code":
		editorContext = "code (user is editing DynamicCode / source in CodeMirror)"
	}
	menuSnapshotLine := ""
	if isMenuJSONContext(req.ContextType) {
		snapshot := TruncateMiddle(strings.TrimSpace(req.CurrentCode), 480)
		nodes := CountMenuNodesFromDraft(snapshot)
		if snapshot == "" {
			menuSnapshotLine = "EDITOR_MENU_SNAPSHOT: (empty editor — greenfield)\n"
		} else {
			menuSnapshotLine = "EDITOR_MENU_SNAPSHOT: " + strconv.Itoa(nodes) + " module(s): " + snapshot + "\n"
		}
	}
	var sb strings.Builder
	sb.WriteString("<|im_start|>system\n")
	sb.WriteString("You route CSM AI assistant requests using Observation → Reasoning → Action.\n")
	sb.WriteString("Output one JSON object only.\n")
	sb.WriteString(`Schema: {"type":"EDIT_MENU|EDIT_CODE|QUESTION|GENERAL","action":"add|modify|delete|ask|search|other",`)
	sb.WriteString(`"responseMode":"edit|analyze","nextStep":"answer_direct|load_menu_context|load_code_context|clarify",`)
	sb.WriteString(`"contextKind":"menu|code|none","confidence":0-100,"reasoning":"one short sentence explaining edit vs analyze"}.` + "\n")
	sb.WriteString("OBSERVATION rules:\n")
	sb.WriteString("- Read EDITOR_CONTEXT + EDITOR_MENU_SNAPSHOT + USER_REQUEST together. Mentioning json/menu/code alone does NOT mean edit.\n")
	sb.WriteString("- Empty/greenfield menu (0 modules) + user asks to write/create/design/build a menu => greenfield menu creation.\n")
	sb.WriteString("- Bug reports (wrong language labels, empty combo, missing f_cbo_query) in an open editor usually need edit to fix JSON.\n")
	sb.WriteString("REASONING rules:\n")
	sb.WriteString("- responseMode=edit when user wants to change/apply/fix/add/remove/update something IN the editor.\n")
	sb.WriteString("- responseMode=analyze when user only wants to understand/explain/review WITHOUT applying changes.\n")
	sb.WriteString("- 'why' / 'xem kỹ' about a visible bug in the editor often still means edit (diagnose then patch).\n")
	sb.WriteString("ACTION: set responseMode, type, nextStep, contextKind from your reasoning.\n")
	sb.WriteString(buildPromptLanguageBlock(req.UILang, message))
	sb.WriteString("\n")
	sb.WriteString("<|im_start|>user\nEDITOR_CONTEXT: ")
	sb.WriteString(editorContext)
	sb.WriteString("\n")
	sb.WriteString(menuSnapshotLine)
	sb.WriteString("USER_REQUEST: ")
	sb.WriteString(message)
	sb.WriteString("\n")
	sb.WriteString("<|im_start|>assistant\n")
	return PrepareLocalProviderPrompt(sb.String(), 6000)
}

func parseIntentClassifyJSON(raw string) LocalIntentClassification {
	candidate := extractJSONObjectCandidate(raw)
	if candidate == "" {
		return unknownIntent("no JSON in classify output")
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(candidate), &parsed); err != nil {
		return unknownIntent("invalid classify JSON")
	}
	typ := strings.ToUpper(strings.TrimSpace(stringVal(parsed["type"], "GENERAL")))
	action := normalizeIntentAction(stringVal(parsed["action"], "other"))
	nextStep := strings.ToLower(strings.TrimSpace(stringVal(parsed["nextStep"], "unknown")))
	contextKind := strings.ToLower(strings.TrimSpace(stringVal(parsed["contextKind"], "none")))
	confidence := intFromAny(parsed["confidence"])
	responseMode := strings.ToLower(strings.TrimSpace(stringVal(parsed["responseMode"], "")))
	if responseMode != "edit" && responseMode != "analyze" {
		responseMode = ""
	}
	reasoning := strings.TrimSpace(stringVal(parsed["reasoning"], ""))
	if len(reasoning) > 320 {
		reasoning = reasoning[:320] + "…"
	}

	switch typ {
	case "EDIT_MENU", "EDIT_CODE", "QUESTION", "GENERAL":
	default:
		typ = "GENERAL"
	}
	switch nextStep {
	case "answer_direct", "load_menu_context", "load_code_context", "clarify", "unknown":
	default:
		nextStep = "unknown"
	}
	switch contextKind {
	case "menu", "code", "none":
	default:
		contextKind = "none"
	}
	if typ == "EDIT_MENU" || typ == "EDIT_CODE" {
		responseMode = "edit"
	}
	if responseMode == "" {
		if typ == "QUESTION" || typ == "GENERAL" {
			responseMode = "analyze"
		} else {
			responseMode = "edit"
		}
	}
	if confidence <= 0 {
		confidence = 70
	}
	return LocalIntentClassification{
		Type: typ, Action: action, Confidence: confidence,
		NextStep: nextStep, ContextKind: contextKind, ResponseMode: responseMode, Reasoning: reasoning,
	}
}

func postGuardIntentClassification(intent LocalIntentClassification, req *CodeStreamRequest, _ string) LocalIntentClassification {
	if req == nil {
		return intent
	}
	if mode := normalizeResponseMode(req.ResponseMode); mode != "" {
		intent.ResponseMode = mode
		switch strings.ToLower(strings.TrimSpace(req.ContextType)) {
		case "menu_json":
			intent.Type = "EDIT_MENU"
			intent.ContextKind = "menu"
			intent.NextStep = "load_menu_context"
		case "code", "frontend_code":
			intent.Type = "EDIT_CODE"
			intent.ContextKind = "code"
			intent.NextStep = "load_code_context"
		}
	}
	return intent
}

func normalizeIntentAction(action string) string {
	action = strings.ToLower(strings.TrimSpace(action))
	switch action {
	case "add", "modify", "delete", "ask", "search", "other":
		return action
	default:
		return "other"
	}
}

func extractJSONObjectCandidate(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	if strings.HasPrefix(text, "```") {
		text = strings.TrimPrefix(text, "```json")
		text = strings.TrimPrefix(text, "```")
		if idx := strings.Index(text, "```"); idx >= 0 {
			text = text[:idx]
		}
		text = strings.TrimSpace(text)
	}
	start := strings.Index(text, "{")
	if start < 0 {
		return ""
	}
	depth := 0
	for i := start; i < len(text); i++ {
		switch text[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				candidate := text[start : i+1]
				if json.Valid([]byte(candidate)) {
					return candidate
				}
			}
		}
	}
	return ""
}

func stringVal(v any, fallback string) string {
	if v == nil {
		return fallback
	}
	switch t := v.(type) {
	case string:
		if strings.TrimSpace(t) == "" {
			return fallback
		}
		return t
	default:
		s := strings.TrimSpace(stringFromAny(v))
		if s == "" {
			return fallback
		}
		return s
	}
}
