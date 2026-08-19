package aieval

import (
	"testing"

	"csm_server/backend-go/internal/ai/domain"
)

func TestFinalGateRequiresEveryRequiredRequirement(t *testing.T) {
	requirements := []domain.Requirement{{ID: "REQ-1", Required: true}, {ID: "REQ-2", Required: true}}
	result := FinalGate(requirements, []domain.RequirementResult{{RequirementID: "REQ-1", Passed: true}})
	if result.Passed || len(result.Missing) != 1 || result.Missing[0] != "REQ-2" {
		t.Fatalf("expected missing required rejection: %+v", result)
	}
}

func TestFinalGateRequiresEvidenceWhenDeclared(t *testing.T) {
	requirements := []domain.Requirement{{ID: "REQ-E", Required: true, RequireEvidence: true}}
	result := FinalGate(requirements, []domain.RequirementResult{{RequirementID: "REQ-E", Passed: true}})
	if result.Passed || result.Score != 0 {
		t.Fatalf("expected missing evidence rejection: %+v", result)
	}
}

func TestFinalGatePassesCompleteRequiredSet(t *testing.T) {
	requirements := []domain.Requirement{{ID: "REQ-E", Required: true, RequireEvidence: true}}
	result := FinalGate(requirements, []domain.RequirementResult{{
		RequirementID: "REQ-E", Passed: true, EvidenceRefs: []string{"artifact://run/a"},
	}})
	if !result.Passed || result.Score != 1 {
		t.Fatalf("expected complete gate: %+v", result)
	}
}
