package slo

import "time"

// Internal SLO targets — wire to Grafana/Prometheus alerts.
const (
	// APIAvailabilityTarget: 99.9% monthly (excluding planned maintenance).
	APIAvailabilityTarget = 0.999

	// APILatencyP99Target: non-AI API p99 latency budget.
	APILatencyP99Target = 500 * time.Millisecond

	// AITTFBTarget: time-to-first-token for SSE streams.
	AITTFBTarget = 3 * time.Second

	// AIErrorRateTarget: failed AI completions / total.
	AIErrorRateTarget = 0.001
)

// Labels for Prometheus recording rules (see deploy/observability/prometheus-rules.yml).
var RecordingRuleHints = []string{
	`sum(rate(csm_http_requests_total{status=~"5.."}[5m])) / sum(rate(csm_http_requests_total[5m]))`,
	`histogram_quantile(0.99, sum(rate(csm_http_request_duration_seconds_bucket[5m])) by (le))`,
	`sum(rate(csm_llama_requests_total{result=~".*error.*"}[5m])) / sum(rate(csm_llama_requests_total[5m]))`,
}
