package orchestrator

import (
	"math/rand"
	"testing"

	"csm_server/backend-go/internal/ai/domain"
)

func TestInvalidatedDescendantsOnlyTouchesDependentSteps(t *testing.T) {
	plan := domain.ExecutionPlan{Steps: []domain.PlanStep{
		{ID: "s1"}, {ID: "s2", DependsOn: []string{"s1"}},
		{ID: "s3", DependsOn: []string{"s2"}}, {ID: "independent"},
	}}
	got := InvalidatedDescendants(plan, []string{"s1"})
	if len(got) != 2 || got[0] != "s2" || got[1] != "s3" {
		t.Fatalf("unexpected invalidation: %v", got)
	}
}

func TestRandomAcyclicPlansValidate(t *testing.T) {
	random := rand.New(rand.NewSource(42))
	for sample := 0; sample < 100; sample++ {
		stepCount := 2 + random.Intn(8)
		steps := make([]domain.PlanStep, 0, stepCount+1)
		for index := 0; index < stepCount; index++ {
			step := domain.PlanStep{
				ID: "s" + string(rune('a'+index)), Sequence: index + 1, Type: "compute",
				InputSchema: "Input", OutputSchema: "Output", MaxInputTokens: 10, MaxOutputTokens: 10,
			}
			if index > 0 && random.Intn(2) == 1 {
				step.DependsOn = []string{steps[random.Intn(index)].ID}
			}
			if index == 0 {
				step.Covers = []string{"REQ"}
			}
			steps = append(steps, step)
		}
		steps = append(steps, domain.PlanStep{
			ID: "gate", Sequence: stepCount + 1, Type: "gate", DependsOn: []string{steps[stepCount-1].ID},
			Covers: []string{"REQ"}, InputSchema: "Output", OutputSchema: "GateResult",
		})
		plan := domain.ExecutionPlan{
			Version: 1, Goal: "random acyclic plan",
			Requirements: []domain.Requirement{{ID: "REQ", Required: true, AcceptanceCriteria: []string{"pass"}}},
			Steps:        steps,
		}
		if result := ValidatePlan(plan, nil, 10, 1000); !result.Valid {
			t.Fatalf("sample %d should validate: %+v", sample, result)
		}
	}
}
