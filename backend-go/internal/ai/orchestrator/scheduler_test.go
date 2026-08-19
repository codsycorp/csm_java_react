package orchestrator

import (
	"testing"

	"csm_server/backend-go/internal/ai/domain"
)

func TestNextRunnableStepWaitsForDependencies(t *testing.T) {
	plan := schedulerPlan()
	step, err := NextRunnableStep(plan, map[string]domain.StepStatus{})
	if err != nil || step == nil || step.ID != "s01" {
		t.Fatalf("expected first step: step=%+v err=%v", step, err)
	}
	step, err = NextRunnableStep(plan, map[string]domain.StepStatus{"s01": domain.StepSucceeded})
	if err != nil || step == nil || step.ID != "s02" {
		t.Fatalf("expected dependent step: step=%+v err=%v", step, err)
	}
}

func TestNextRunnableStepBlocksFailedDependency(t *testing.T) {
	_, err := NextRunnableStep(schedulerPlan(), map[string]domain.StepStatus{"s01": domain.StepFailed})
	if err == nil {
		t.Fatal("expected failed dependency to block descendants")
	}
}

func schedulerPlan() domain.ExecutionPlan {
	return domain.ExecutionPlan{Steps: []domain.PlanStep{
		{ID: "s01", Sequence: 1, Required: true},
		{ID: "s02", Sequence: 2, Required: true, DependsOn: []string{"s01"}},
	}}
}
