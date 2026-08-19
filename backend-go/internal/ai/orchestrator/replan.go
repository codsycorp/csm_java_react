package orchestrator

import (
	"sort"

	"csm_server/backend-go/internal/ai/domain"
)

func InvalidatedDescendants(plan domain.ExecutionPlan, changedStepIDs []string) []string {
	reverse := map[string][]string{}
	for _, step := range plan.Steps {
		for _, dependencyID := range step.DependsOn {
			reverse[dependencyID] = append(reverse[dependencyID], step.ID)
		}
	}
	invalidated := map[string]bool{}
	queue := append([]string(nil), changedStepIDs...)
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, childID := range reverse[current] {
			if invalidated[childID] {
				continue
			}
			invalidated[childID] = true
			queue = append(queue, childID)
		}
	}
	for _, changedID := range changedStepIDs {
		delete(invalidated, changedID)
	}
	result := make([]string, 0, len(invalidated))
	for stepID := range invalidated {
		result = append(result, stepID)
	}
	sort.Strings(result)
	return result
}
