package services

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestClassifyIntentHeuristicMenuContextFallbackEdit(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Thêm module bán hàng với bảng orders",
		CurrentCode: `{"menu":[{"id":"kho","label":"Kho"}]}`,
	}
	got := ClassifyIntentHeuristic(req)
	if got.Type != "EDIT_MENU" || got.ResponseMode != "edit" {
		t.Fatalf("got %+v want EDIT_MENU edit fallback", got)
	}
}

func TestClassifyIntentHeuristicMenuNoKeywordRouting(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Giải thích cấu trúc menu hiện tại",
		CurrentCode: `{"menu":[{"id":"kho","label":"Kho"}]}`,
	}
	got := ClassifyIntentHeuristic(req)
	if got.ResponseMode != "edit" {
		t.Fatalf("fallback should not keyword-route to analyze, got %s", got.ResponseMode)
	}
}

func TestParseIntentClassifyJSONMenuBugEdit(t *testing.T) {
	raw := `{"type":"EDIT_MENU","action":"modify","responseMode":"edit","nextStep":"load_menu_context","contextKind":"menu","confidence":91,"reasoning":"User reports wrong i18n labels in open menu editor — needs patch."}`
	got := parseIntentClassifyJSON(raw)
	if got.Type != "EDIT_MENU" || got.ResponseMode != "edit" {
		t.Fatalf("got %+v want EDIT_MENU edit", got)
	}
}

func TestParseIntentClassifyJSONAnalyzeOnly(t *testing.T) {
	raw := "```json\n{\"type\":\"QUESTION\",\"action\":\"ask\",\"responseMode\":\"analyze\",\"nextStep\":\"load_menu_context\",\"contextKind\":\"menu\",\"confidence\":85,\"reasoning\":\"Explain structure only.\"}\n```"
	got := parseIntentClassifyJSON(raw)
	if got.ResponseMode != "analyze" {
		t.Fatalf("responseMode=%s want analyze", got.ResponseMode)
	}
}

func TestResolvePipelineResponseModePrefersLLMIntent(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Giải thích cấu trúc menu hiện tại",
	}
	intent := LocalIntentClassification{Type: "QUESTION", ResponseMode: "analyze", Confidence: 88}
	if got := ResolvePipelineResponseMode(req, intent); got != "analyze" {
		t.Fatalf("got %s want analyze from LLM intent", got)
	}
}

func TestResolvePipelineResponseModeExplicitClientWins(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "menu_json", ResponseMode: "edit"}
	intent := LocalIntentClassification{Type: "QUESTION", ResponseMode: "analyze", Confidence: 88}
	if got := ResolvePipelineResponseMode(req, intent); got != "edit" {
		t.Fatalf("got %s want explicit client edit", got)
	}
}

func TestClassifyIntentHeuristicGreenfield(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Tạo menu ERP bán hàng và kho",
		CurrentCode: `{"menu":[]}`,
	}
	got := ClassifyIntentHeuristic(req)
	if got.Type != "EDIT_MENU" || got.ResponseMode != "edit" {
		t.Fatalf("got %+v want EDIT_MENU edit", got)
	}
}

func TestReconcileResponseModeWithIntent(t *testing.T) {
	intent := LocalIntentClassification{Type: "EDIT_CODE", ResponseMode: "analyze"}
	if got := ReconcileResponseModeWithIntent(intent, "analyze"); got != "analyze" {
		t.Fatalf("got %s want analyze when client explicit", got)
	}
}

func TestLearningMemoryRecordAndRetrieve(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: dir}}
	appID := "testapp"

	err := RecordSuccessfulCodeEdit(cfg, nil, appID, "fix timer leak", "replaced setInterval with cleanup", "code", "code_editor", 2)
	if err != nil {
		t.Fatal(err)
	}
	block := BuildLearningContextBlock(cfg, nil, appID, "timer leak fix", "code", 4000)
	if !containsStr(block, "timer leak") {
		t.Fatalf("expected learning block to contain request, got: %q", block)
	}

	err = RecordSuccessfulCodeEdit(cfg, nil, appID, "fix timer leak", "replaced setInterval with cleanup", "code", "code_editor", 2)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := loadCodeLearningEntries(cfg, nil, appID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries=%d want 1 (deduped)", len(entries))
	}
	path := filepath.Join(dir, "ai_code_learning_testapp.jsonl")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("jsonl file missing: %v", err)
	}
}

func TestComprehendBusinessHeuristicMenu(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Thêm module CRM",
		CurrentCode: `{"menu":[{"id":"ban_hang","label":"Bán hàng","children":[{"id":"don","label":"Đơn hàng"}]}]}`,
	}
	spec := ComprehendBusinessHeuristic(req)
	if len(spec.Modules) < 2 {
		t.Fatalf("modules=%v want >=2", spec.Modules)
	}
	block := BuildComprehendPromptBlock(spec)
	if !containsStr(block, "BUSINESS_COMPREHENSION") {
		t.Fatalf("missing comprehend block")
	}
}

func TestPhase1PipelineProducesSSEEvents(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: t.TempDir()}}
	req := &CodeStreamRequest{
		RequestID: "req-1", AppID: "csm", FlowType: "menu_manager",
		ContextType: "menu_json", TaskType: "menu_design",
		Message: "Thêm module kho", CurrentCode: `{"menu":[]}`,
	}
	ctx := PreparePhase1Pipeline(cfg, nil, nil, req, PipelineInput{})
	events := Phase1SSEEvents(req, ctx)
	if len(events) < 8 {
		t.Fatalf("events=%d want >=8", len(events))
	}
	stages := map[string]bool{}
	for _, e := range events {
		if s, ok := e["stage"].(string); ok {
			stages[s] = true
		}
	}
	for _, want := range []string{"intent_reasoning", "routing", "business_comprehend", "agentic_plan", "agent_handoff", "tool_search", "retrieval_quality_gate", "rag_citations"} {
		if !stages[want] {
			t.Fatalf("missing stage %s in %v", want, stages)
		}
	}
}

func TestBuildOrchestrationSnapshot(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: t.TempDir()}}
	req := &CodeStreamRequest{
		ContextType: "code", Message: "Sửa hàm init", CurrentCode: "function init() {}",
	}
	intent := ClassifyIntentHeuristic(req)
	snap := BuildOrchestrationSnapshot(cfg, req, intent, "learning", "comprehend", req.CurrentCode, TenantRAGResult{})
	if len(snap.PlanSteps) < 5 {
		t.Fatalf("planSteps=%d want >=5", len(snap.PlanSteps))
	}
	if snap.RoutingTier == "" {
		t.Fatal("empty routing tier")
	}
}
