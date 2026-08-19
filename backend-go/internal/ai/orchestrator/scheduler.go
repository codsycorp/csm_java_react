package orchestrator

import (
	"fmt"
	"sort"

	"csm_server/backend-go/internal/ai/domain"
)

func NextRunnableStep(plan domain.ExecutionPlan, statuses map[string]domain.StepStatus) (*domain.PlanStep, error) {
	steps := append([]domain.PlanStep(nil), plan.Steps...)
	sort.SliceStable(steps, func(left, right int) bool { return steps[left].Sequence < steps[right].Sequence })
	pending := 0
	for index := range steps {
		step := &steps[index]
		status := statuses[step.ID]
		if status == domain.StepSucceeded {
			continue
		}
		if status == domain.StepRunning || status == domain.StepCandidate {
			return nil, nil
		}
		if status == domain.StepFailed {
			if step.Required {
				return nil, fmt.Errorf("required step failed: %s", step.ID)
			}
			continue
		}
		pending++
		dependenciesReady := true
		for _, dependencyID := range step.DependsOn {
			dependencyStatus := statuses[dependencyID]
			if dependencyStatus == domain.StepFailed {
				return nil, fmt.Errorf("step %s blocked by failed dependency %s", step.ID, dependencyID)
			}
			if dependencyStatus != domain.StepSucceeded {
				dependenciesReady = false
				break
			}
		}
		if dependenciesReady {
			copyStep := *step
			return &copyStep, nil
		}
	}
	if pending > 0 {
		return nil, fmt.Errorf("plan has pending steps but none are runnable")
	}
	return nil, nil
}
