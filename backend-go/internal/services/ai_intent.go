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

// ClassifyIntentHeuristic classifies user intent without LLM (Phase 1 fast path).
func ClassifyIntentHeuristic(req *CodeStreamRequest) LocalIntentClassification {
	msg := strings.TrimSpace(req.Message)
	lower := strings.ToLower(msg)
	ctx := strings.ToLower(strings.TrimSpace(req.ContextType))

	if msg == "" {
		return unknownIntent("Empty user request")
	}

	isMenu := ctx == "menu_json"
	isCode := ctx == "code" || ctx == "frontend_code"

	analyze := hasAnalyzeIntent(lower)
	edit := hasEditIntent(lower)

	if isMenu {
		greenfield := IsEffectivelyEmptyMenuEditor(req.CurrentCode)
		if greenfield && (edit || hasGreenfieldMenuIntent(lower)) {
			return LocalIntentClassification{
				Type: "EDIT_MENU", Action: "add", Confidence: 90,
				NextStep: "load_menu_context", ContextKind: "menu", ResponseMode: "edit",
				Reasoning: "Menu editor trống và người dùng yêu cầu tạo/thiết kế menu mới.",
			}
		}
		if analyze && !edit {
			return LocalIntentClassification{
				Type: "QUESTION", Action: "ask", Confidence: 85,
				NextStep: "load_menu_context", ContextKind: "menu", ResponseMode: "analyze",
				Reasoning: "Người dùng muốn phân tích/giải thích menu, không chỉnh sửa cấu trúc.",
			}
		}
		if edit || strings.Contains(strings.ToLower(req.TaskType), "patch") || strings.Contains(strings.ToLower(req.TaskType), "design") {
			action := "modify"
			if strings.Contains(lower, "thêm") || strings.Contains(lower, "add") || strings.Contains(lower, "tạo") || strings.Contains(lower, "create") {
				action = "add"
			} else if strings.Contains(lower, "xóa") || strings.Contains(lower, "delete") || strings.Contains(lower, "remove") {
				action = "delete"
			}
			return LocalIntentClassification{
				Type: "EDIT_MENU", Action: action, Confidence: 82,
				NextStep: "load_menu_context", ContextKind: "menu", ResponseMode: "edit",
				Reasoning: "Editor menu đang mở và yêu cầu thay đổi cấu trúc menu.",
			}
		}
		if strings.Contains(lower, "?") {
			return LocalIntentClassification{
				Type: "QUESTION", Action: "ask", Confidence: 75,
				NextStep: "load_menu_context", ContextKind: "menu", ResponseMode: "analyze",
				Reasoning: "Câu hỏi về menu — trả lời phân tích, không auto-apply.",
			}
		}
		return LocalIntentClassification{
			Type: "EDIT_MENU", Action: "modify", Confidence: 70,
			NextStep: "load_menu_context", ContextKind: "menu", ResponseMode: "edit",
			Reasoning: "Ngữ cảnh menu_json mặc định luồng chỉnh sửa menu.",
		}
	}

	if isCode {
		if analyze && !edit {
			return LocalIntentClassification{
				Type: "QUESTION", Action: "ask", Confidence: 85,
				NextStep: "load_code_context", ContextKind: "code", ResponseMode: "analyze",
				Reasoning: "Người dùng muốn hiểu/giải thích code, không áp dụng patch.",
			}
		}
		if edit || strings.Contains(strings.ToLower(req.TaskType), "patch") {
			action := "modify"
			if strings.Contains(lower, "thêm") || strings.Contains(lower, "add") {
				action = "add"
			} else if strings.Contains(lower, "xóa") || strings.Contains(lower, "delete") {
				action = "delete"
			}
			return LocalIntentClassification{
				Type: "EDIT_CODE", Action: action, Confidence: 82,
				NextStep: "load_code_context", ContextKind: "code", ResponseMode: "edit",
				Reasoning: "Editor code đang mở và yêu cầu sửa mã nguồn.",
			}
		}
		if strings.Contains(lower, "?") {
			return LocalIntentClassification{
				Type: "QUESTION", Action: "ask", Confidence: 75,
				NextStep: "load_code_context", ContextKind: "code", ResponseMode: "analyze",
				Reasoning: "Câu hỏi về code — trả lời phân tích.",
			}
		}
		return LocalIntentClassification{
			Type: "EDIT_CODE", Action: "modify", Confidence: 70,
			NextStep: "load_code_context", ContextKind: "code", ResponseMode: "edit",
			Reasoning: "Ngữ cảnh code editor mặc định luồng chỉnh sửa.",
		}
	}

	if analyze || strings.Contains(lower, "?") {
		return LocalIntentClassification{
			Type: "QUESTION", Action: "ask", Confidence: 72,
			NextStep: "answer_direct", ContextKind: "none", ResponseMode: "analyze",
			Reasoning: "Câu hỏi chung không gắn editor cụ thể.",
		}
	}
	return LocalIntentClassification{
		Type: "GENERAL", Action: "other", Confidence: 55,
		NextStep: "unknown", ContextKind: "none", ResponseMode: "analyze",
		Reasoning: "Yêu cầu chung — trả lời phân tích an toàn.",
	}
}

// ReconcileResponseModeWithIntent forces EDIT_* intents to edit mode (Java parity).
func ReconcileResponseModeWithIntent(intent LocalIntentClassification, explicitMode string) string {
	if explicitMode != "" {
		mode := strings.ToLower(strings.TrimSpace(explicitMode))
		if mode == "edit" || mode == "analyze" {
			if intent.Type == "EDIT_MENU" || intent.Type == "EDIT_CODE" {
				return "edit"
			}
			return mode
		}
	}
	if intent.ResponseMode == "edit" || intent.ResponseMode == "analyze" {
		if intent.Type == "EDIT_MENU" || intent.Type == "EDIT_CODE" {
			return "edit"
		}
		return intent.ResponseMode
	}
	return "edit"
}

func unknownIntent(reason string) LocalIntentClassification {
	return LocalIntentClassification{
		Type: "GENERAL", Action: "other", Confidence: 0,
		NextStep: "unknown", ContextKind: "none", ResponseMode: "analyze",
		Reasoning: reason,
	}
}

func hasAnalyzeIntent(lower string) bool {
	keys := []string{
		"giải thích", "phan tich", "phân tích", "tại sao", "tai sao", "là gì", "la gi",
		"explain", "analyze", "analyse", "review", "describe", "what does", "why ",
		"hiểu", "hieu", "đọc", "doc code", "đánh giá", "danh gia",
	}
	for _, k := range keys {
		if strings.Contains(lower, k) {
			return true
		}
	}
	return false
}

func hasEditIntent(lower string) bool {
	keys := []string{
		"thêm", "sửa", "sua", "xóa", "xoa", "cập nhật", "cap nhat", "tạo", "tao", "viết", "viet",
		"chỉnh", "chinh", "fix", "patch", "add ", "modify", "delete", "update", "create", "build", "design",
		"implement", "refactor", "rename", "insert", "remove", "apply",
	}
	for _, k := range keys {
		if strings.Contains(lower, k) {
			return true
		}
	}
	return false
}

func hasGreenfieldMenuIntent(lower string) bool {
	keys := []string{
		"tạo menu", "tao menu", "thiết kế menu", "thiet ke menu", "viết menu", "viet menu",
		"create menu", "build menu", "design menu", "greenfield", "menu mới", "menu moi",
	}
	for _, k := range keys {
		if strings.Contains(lower, k) {
			return true
		}
	}
	return false
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
	}
}
