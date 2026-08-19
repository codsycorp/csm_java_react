package orchestrator

import (
	"fmt"
	"sort"
	"strings"

	"csm_server/backend-go/internal/ai/domain"
)

type PlanValidationResult struct {
	Valid                    bool
	Errors                   []string
	MissingRequirements      []string
	MissingVerifierFor       []string
	EstimatedMaxInputTokens  int
	EstimatedMaxOutputTokens int
}

func ValidatePlan(plan domain.ExecutionPlan, allowedTools []string, maxSteps, maxTotalTokens int) PlanValidationResult {
	result := PlanValidationResult{Valid: true}
	addError := func(message string) {
		result.Valid = false
		result.Errors = append(result.Errors, message)
	}
	if plan.Version < 1 {
		addError("plan version must be >= 1")
	}
	if strings.TrimSpace(plan.Goal) == "" {
		addError("plan goal is required")
	}
	if maxSteps > 0 && len(plan.Steps) > maxSteps {
		addError(fmt.Sprintf("plan has %d steps, maximum is %d", len(plan.Steps), maxSteps))
	}

	requirements := make(map[string]domain.Requirement, len(plan.Requirements))
	for _, requirement := range plan.Requirements {
		requirementID := strings.TrimSpace(requirement.ID)
		if requirementID == "" {
			addError("requirement id is required")
			continue
		}
		if _, exists := requirements[requirementID]; exists {
			addError("duplicate requirement id: " + requirementID)
			continue
		}
		if requirement.Required && len(requirement.AcceptanceCriteria) == 0 {
			addError("required requirement has no acceptance criteria: " + requirementID)
		}
		requirements[requirementID] = requirement
	}

	allowed := make(map[string]struct{}, len(allowedTools))
	for _, tool := range allowedTools {
		allowed[strings.TrimSpace(tool)] = struct{}{}
	}
	steps := make(map[string]domain.PlanStep, len(plan.Steps))
	producerCoverage := map[string]bool{}
	verifierCoverage := map[string]bool{}
	for _, step := range plan.Steps {
		stepID := strings.TrimSpace(step.ID)
		if stepID == "" {
			addError("step id is required")
			continue
		}
		if _, exists := steps[stepID]; exists {
			addError("duplicate step id: " + stepID)
			continue
		}
		if strings.TrimSpace(step.InputSchema) == "" || strings.TrimSpace(step.OutputSchema) == "" {
			addError("step must declare input and output schema: " + stepID)
		}
		if step.MaxInputTokens < 0 || step.MaxOutputTokens < 0 {
			addError("step token budgets cannot be negative: " + stepID)
		}
		result.EstimatedMaxInputTokens += step.MaxInputTokens
		result.EstimatedMaxOutputTokens += step.MaxOutputTokens
		if strings.EqualFold(step.Type, "tool") {
			if strings.TrimSpace(step.Tool) == "" {
				addError("tool step has no tool: " + stepID)
			} else if _, ok := allowed[step.Tool]; !ok {
				addError("tool is not allowed: " + step.Tool)
			}
		}
		for _, requirementID := range step.Covers {
			if _, ok := requirements[requirementID]; !ok {
				addError("step " + stepID + " covers unknown requirement: " + requirementID)
				continue
			}
			if strings.EqualFold(step.Type, "gate") || strings.EqualFold(step.Type, "verify") {
				verifierCoverage[requirementID] = true
			} else {
				producerCoverage[requirementID] = true
			}
		}
		steps[stepID] = step
	}
	if maxTotalTokens > 0 && result.EstimatedMaxInputTokens+result.EstimatedMaxOutputTokens > maxTotalTokens {
		addError("plan token budget exceeds run hard budget")
	}

	for _, step := range plan.Steps {
		for _, dependencyID := range step.DependsOn {
			if _, ok := steps[dependencyID]; !ok {
				addError("step " + step.ID + " depends on unknown step: " + dependencyID)
			}
		}
	}
	if cycle := findCycle(plan.Steps); len(cycle) > 0 {
		addError("plan contains dependency cycle: " + strings.Join(cycle, " -> "))
	}

	for requirementID, requirement := range requirements {
		if !requirement.Required {
			continue
		}
		if !producerCoverage[requirementID] {
			result.MissingRequirements = append(result.MissingRequirements, requirementID)
		}
		if !verifierCoverage[requirementID] {
			result.MissingVerifierFor = append(result.MissingVerifierFor, requirementID)
		}
	}
	if len(result.MissingRequirements) > 0 || len(result.MissingVerifierFor) > 0 {
		result.Valid = false
	}
	sort.Strings(result.Errors)
	sort.Strings(result.MissingRequirements)
	sort.Strings(result.MissingVerifierFor)
	return result
}

func findCycle(steps []domain.PlanStep) []string {
	dependencies := make(map[string][]string, len(steps))
	for _, step := range steps {
		dependencies[step.ID] = append([]string(nil), step.DependsOn...)
	}
	visiting := map[string]bool{}
	visited := map[string]bool{}
	var path []string
	var visit func(string) bool
	visit = func(stepID string) bool {
		if visiting[stepID] {
			path = append(path, stepID)
			return true
		}
		if visited[stepID] {
			return false
		}
		visiting[stepID] = true
		path = append(path, stepID)
		for _, dependencyID := range dependencies[stepID] {
			if visit(dependencyID) {
				return true
			}
		}
		path = path[:len(path)-1]
		visiting[stepID] = false
		visited[stepID] = true
		return false
	}
	for stepID := range dependencies {
		path = nil
		if visit(stepID) {
			return append([]string(nil), path...)
		}
	}
	return nil
}
