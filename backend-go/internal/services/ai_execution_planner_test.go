package services

import (
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestGenerateExecutionPlanMenuAnalyze(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Xem kỹ kiểu co tại sao cột hiện tiếng Anh khi chọn tiếng Việt",
		CurrentCode: `{"menu":[{"trigger":{"fields":[{"f_name":"x","f_types":"co"}]}}]}`,
	}
	plan := GenerateExecutionPlan(req, "analyze", "rag hit")
	if len(plan.Steps) < 4 {
		t.Fatalf("expected >=4 steps, got %d", len(plan.Steps))
	}
	if plan.Steps[0].Scope != "menu_tree" {
		t.Fatalf("first step scope=%s want menu_tree", plan.Steps[0].Scope)
	}
}

func TestShouldUseIncrementalPlanExecute(t *testing.T) {
	cfg := config.AppConfig{}
	req := &CodeStreamRequest{Message: "Phân tích menu combo co", ContextType: "menu_json"}
	phase1 := RunPhase1PipelineContext{ResponseMode: "analyze"}
	if !ShouldUseIncrementalPlanExecute(cfg, req, phase1) {
		t.Fatal("expected incremental plan for analyze menu")
	}
}

func TestPlanStepLabels(t *testing.T) {
	labels := planStepLabels([]ExecutionPlanStep{{Action: "analyze", Description: "test"}})
	if len(labels) != 1 || labels[0] != "[analyze] test" {
		t.Fatalf("unexpected labels: %v", labels)
	}
}
