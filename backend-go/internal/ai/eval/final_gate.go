package aieval

import "csm_server/backend-go/internal/ai/domain"

func FinalGate(requirements []domain.Requirement, results []domain.RequirementResult) domain.VerificationResult {
	byID := make(map[string]domain.RequirementResult, len(results))
	for _, result := range results {
		byID[result.RequirementID] = result
	}
	verification := domain.VerificationResult{Passed: true, Score: 1}
	requiredCount := 0
	passedCount := 0
	for _, requirement := range requirements {
		if !requirement.Required {
			continue
		}
		requiredCount++
		result, exists := byID[requirement.ID]
		if !exists || !result.Passed || (requirement.RequireEvidence && len(result.EvidenceRefs) == 0) {
			verification.Passed = false
			verification.Missing = append(verification.Missing, requirement.ID)
			if !exists {
				result = domain.RequirementResult{RequirementID: requirement.ID, Reason: "missing result"}
			} else if requirement.RequireEvidence && len(result.EvidenceRefs) == 0 {
				result.Passed = false
				result.Reason = "missing evidence"
			}
		} else {
			passedCount++
		}
		verification.Requirements = append(verification.Requirements, result)
	}
	if requiredCount > 0 {
		verification.Score = float64(passedCount) / float64(requiredCount)
	}
	return verification
}
