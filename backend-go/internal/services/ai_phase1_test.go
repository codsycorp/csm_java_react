package services

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestClassifyIntentHeuristicMenuEdit(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Thêm module bán hàng với bảng orders",
		CurrentCode: `{"menu":[{"id":"kho","label":"Kho"}]}`,
		TaskType:    "menu_design",
	}
	got := ClassifyIntentHeuristic(req)
	if got.Type != "EDIT_MENU" {
		t.Fatalf("type=%s want EDIT_MENU", got.Type)
	}
	if got.ResponseMode != "edit" {
		t.Fatalf("responseMode=%s want edit", got.ResponseMode)
	}
}

func TestClassifyIntentHeuristicMenuAnalyze(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Giải thích cấu trúc menu hiện tại",
		CurrentCode: `{"menu":[{"id":"kho","label":"Kho"}]}`,
	}
	got := ClassifyIntentHeuristic(req)
	if got.ResponseMode != "analyze" {
		t.Fatalf("responseMode=%s want analyze", got.ResponseMode)
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
	if got := ReconcileResponseModeWithIntent(intent, "analyze"); got != "edit" {
		t.Fatalf("got %s want edit for EDIT_CODE", got)
	}
}

func TestLearningMemoryRecordAndRetrieve(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: dir}}
	appID := "testapp"

	err := RecordSuccessfulCodeEdit(cfg, appID, "fix timer leak", "replaced setInterval with cleanup", "code", "code_editor", 2)
	if err != nil {
		t.Fatal(err)
	}
	block := BuildLearningContextBlock(cfg, appID, "timer leak fix", "code", 4000)
	if !containsStr(block, "timer leak") {
		t.Fatalf("expected learning block to contain request, got: %q", block)
	}

	// Dedupe by digest
	err = RecordSuccessfulCodeEdit(cfg, appID, "fix timer leak", "replaced setInterval with cleanup", "code", "code_editor", 2)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := loadCodeLearningEntries(cfg, appID)
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
	ctx := PreparePhase1Pipeline(cfg, nil, req, PipelineInput{})
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
