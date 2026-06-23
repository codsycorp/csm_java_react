package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "csm_http_requests_total",
		Help: "Total HTTP requests",
	}, []string{"method", "path", "status"})

	httpDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "csm_http_request_duration_seconds",
		Help:    "HTTP request latency",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "path"})

	llamaRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "csm_llama_requests_total",
		Help: "Llama inference calls",
	}, []string{"result"})

	llamaDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "csm_llama_request_duration_seconds",
		Help:    "Llama inference latency",
		Buckets: []float64{0.5, 1, 2, 5, 10, 30, 60, 120, 300},
	})

	auditEvents = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "csm_audit_events_total",
		Help: "Audit log events",
	}, []string{"action"})

	rateLimitHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "csm_rate_limit_hits_total",
		Help: "Requests blocked by rate limiter",
	})

	readyGauge = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "csm_component_ready",
		Help: "1 when component is ready, 0 otherwise",
	}, []string{"component"})
)

// Handler exposes Prometheus scrape endpoint.
func Handler() http.Handler { return promhttp.Handler() }

// Middleware records request SLIs for SRE dashboards.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		path := normalizePath(r.URL.Path)
		status := strconv.Itoa(sw.status)
		httpRequests.WithLabelValues(r.Method, path, status).Inc()
		httpDuration.WithLabelValues(r.Method, path).Observe(time.Since(start).Seconds())
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func normalizePath(p string) string {
	if p == "" {
		return "/"
	}
	// Collapse high-cardinality API paths for metrics.
	if len(p) > 64 {
		return p[:64]
	}
	return p
}

func ObserveLlama(result string, d time.Duration) {
	llamaRequests.WithLabelValues(result).Inc()
	llamaDuration.Observe(d.Seconds())
}

func IncAudit(action string) { auditEvents.WithLabelValues(action).Inc() }

func IncRateLimit() { rateLimitHits.Inc() }

func SetComponentReady(component string, ready bool) {
	v := 0.0
	if ready {
		v = 1
	}
	readyGauge.WithLabelValues(component).Set(v)
}
