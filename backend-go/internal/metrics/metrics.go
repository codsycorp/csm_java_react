package metrics

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "csm_http_requests_total",
			Help: "Total HTTP requests served, labeled by status, method and coarse path.",
		},
		[]string{"status", "method", "path"},
	)
	httpRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "csm_http_request_duration_seconds",
			Help:    "HTTP request latency in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)
	llamaRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "csm_llama_requests_total",
			Help: "Total local llama inference requests by result.",
		},
		[]string{"result"},
	)
	outboxPending = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "csm_outbox_pending",
			Help: "Number of pending transactional outbox messages.",
		},
	)
	errorBudgetRemainingRatio = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "csm_error_budget_remaining_ratio",
			Help: "Fraction of the monthly error budget remaining (1.0 = full budget).",
		},
	)
	lakeExportTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "csm_lake_export_total",
			Help: "Total analytics lake exports.",
		},
	)
)

func init() {
	prometheus.MustRegister(
		httpRequestsTotal,
		httpRequestDuration,
		llamaRequestsTotal,
		outboxPending,
		errorBudgetRemainingRatio,
		lakeExportTotal,
	)
}

// Middleware records HTTP request counts and latency for every request except /metrics itself.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		path := coarsePath(r.URL.Path)
		httpRequestsTotal.WithLabelValues(strconv.Itoa(status), r.Method, path).Inc()
		httpRequestDuration.WithLabelValues(r.Method, path).Observe(time.Since(start).Seconds())
	})
}

// Handler exposes Prometheus scrape endpoint.
func Handler() http.Handler {
	return promhttp.Handler()
}

// LlamaRequest records a local llama inference attempt by result (ok|error).
func LlamaRequest(result string) {
	llamaRequestsTotal.WithLabelValues(result).Inc()
}

// SetOutboxPending updates the pending outbox gauge.
func SetOutboxPending(n int) {
	outboxPending.Set(float64(n))
}

// SetErrorBudgetRemainingRatio updates the SLO error budget gauge (0..1).
func SetErrorBudgetRemainingRatio(ratio float64) {
	errorBudgetRemainingRatio.Set(ratio)
}

// IncLakeExport increments the analytics lake export counter.
func IncLakeExport() {
	lakeExportTotal.Inc()
}

// coarsePath buckets a request path to keep label cardinality bounded:
// /api/<x>/<y> keeps three segments, everything else keeps two.
func coarsePath(path string) string {
	trimmed := strings.Trim(path, "/")
	if trimmed == "" {
		return "/"
	}
	segs := strings.Split(trimmed, "/")
	limit := 2
	if segs[0] == "api" {
		limit = 3
	}
	if len(segs) > limit {
		segs = segs[:limit]
	}
	if segs[0] == "api" {
		return "/" + strings.Join(segs, "/")
	}
	return strings.Join(segs, "/")
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.ResponseWriter.Write(b)
}

func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
