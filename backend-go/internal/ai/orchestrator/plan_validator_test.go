package orchestrator

import (
	"testing"

	"csm_server/backend-go/internal/ai/domain"
)

func TestValidatePlanRequiresProducerAndVerifier(t *testing.T) {
	plan := validPlan()
	plan.Steps = plan.Steps[:1]
	result := ValidatePlan(plan, []string{"records.read"}, 10, 10_000)
	if result.Valid || len(result.MissingVerifierFor) != 1 {
		t.Fatalf("expected missing verifier rejection: %+v", result)
	}
}

func TestValidatePlanRejectsCycleAndUnauthorizedTool(t *testing.T) {
	plan := validPlan()
	plan.Steps[0].DependsOn = []string{"verify"}
	plan.Steps[0].Tool = "records.write"
	result := ValidatePlan(plan, []string{"records.read"}, 10, 10_000)
	if result.Valid || len(result.Errors) < 2 {
		t.Fatalf("expected cycle and tool rejection: %+v", result)
	}
}

func TestValidatePlanAcceptsCompleteCoverage(t *testing.T) {
	result := ValidatePlan(validPlan(), []string{"records.read"}, 10, 10_000)
	if !result.Valid {
		t.Fatalf("expected valid plan: %+v", result)
	}
}

func validPlan() domain.ExecutionPlan {
	return domain.ExecutionPlan{
		Version: 1,
		Goal:    "read and verify records",
		Requirements: []domain.Requirement{{
			ID: "REQ-001", Description: "read records", Required: true,
			AcceptanceCriteria: []string{"records are present"},
		}},
		Steps: []domain.PlanStep{
			{ID: "read", Sequence: 1, Type: "tool", Tool: "records.read", Covers: []string{"REQ-001"}, InputSchema: "ReadInput", OutputSchema: "Rows", Required: true, MaxInputTokens: 100, MaxOutputTokens: 100},
			{ID: "verify", Sequence: 2, Type: "gate", DependsOn: []string{"read"}, Covers: []string{"REQ-001"}, InputSchema: "Rows", OutputSchema: "GateResult", Required: true, MaxInputTokens: 100, MaxOutputTokens: 50},
		},
	}
}
