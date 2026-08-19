package aieval

import "testing"

func TestQualityGateRejectsInsufficientSamples(t *testing.T) {
	report := EvaluateQuality([]RunOutcome{{Complete: true}}, QualityThresholds{
		MinimumSamples: 50, MinimumCompleteRunRate: 0.95, MaximumUnsupportedClaimRate: 0.01,
	})
	if report.Passed || len(report.Reasons) == 0 {
		t.Fatalf("expected insufficient sample rejection: %+v", report)
	}
}

func TestQualityGatePassesMeasuredThresholds(t *testing.T) {
	outcomes := make([]RunOutcome, 50)
	for index := range outcomes {
		outcomes[index] = RunOutcome{Complete: index < 49, TotalClaims: 10}
	}
	report := EvaluateQuality(outcomes, QualityThresholds{
		MinimumSamples: 50, MinimumCompleteRunRate: 0.95, MaximumUnsupportedClaimRate: 0.01,
	})
	if !report.Passed || report.CompleteRunRate != 0.98 {
		t.Fatalf("expected passing measured gate: %+v", report)
	}
}
