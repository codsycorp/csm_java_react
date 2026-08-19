package aieval

type RunOutcome struct {
	Complete          bool
	UnsupportedClaims int
	TotalClaims       int
}

type QualityThresholds struct {
	MinimumSamples              int
	MinimumCompleteRunRate      float64
	MaximumUnsupportedClaimRate float64
}

type QualityReport struct {
	Passed               bool
	SampleCount          int
	CompleteRunRate      float64
	UnsupportedClaimRate float64
	Reasons              []string
}

func EvaluateQuality(outcomes []RunOutcome, thresholds QualityThresholds) QualityReport {
	report := QualityReport{SampleCount: len(outcomes)}
	completeRuns := 0
	unsupportedClaims := 0
	totalClaims := 0
	for _, outcome := range outcomes {
		if outcome.Complete {
			completeRuns++
		}
		unsupportedClaims += outcome.UnsupportedClaims
		totalClaims += outcome.TotalClaims
	}
	if len(outcomes) > 0 {
		report.CompleteRunRate = float64(completeRuns) / float64(len(outcomes))
	}
	if totalClaims > 0 {
		report.UnsupportedClaimRate = float64(unsupportedClaims) / float64(totalClaims)
	}
	if report.SampleCount < thresholds.MinimumSamples {
		report.Reasons = append(report.Reasons, "insufficient_samples")
	}
	if report.CompleteRunRate < thresholds.MinimumCompleteRunRate {
		report.Reasons = append(report.Reasons, "complete_run_rate_below_threshold")
	}
	if report.UnsupportedClaimRate > thresholds.MaximumUnsupportedClaimRate {
		report.Reasons = append(report.Reasons, "unsupported_claim_rate_above_threshold")
	}
	report.Passed = len(report.Reasons) == 0
	return report
}
