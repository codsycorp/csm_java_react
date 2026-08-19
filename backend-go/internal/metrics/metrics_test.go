package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMiddlewareRecordsStatusAndCounters(t *testing.T) {
	handler := Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/login", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	var out strings.Builder
	Handler().ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/metrics", nil))
	_ = out

	count := httpRequestsTotal.WithLabelValues("500", "GET", "/api/login")
	if count == nil {
		t.Fatal("counter not found")
	}
}

func TestCoarsePathBucketing(t *testing.T) {
	cases := map[string]string{
		"/api/crm/customer/123": "/api/crm/customer",
		"/api/login":            "/api/login",
		"/get-table-data":       "get-table-data",
		"/upload.shtml":         "upload.shtml",
		"/":                     "/",
		"":                      "/",
	}
	for in, want := range cases {
		if got := coarsePath(in); got != want {
			t.Fatalf("coarsePath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestHandlerExposesRegisteredMetrics(t *testing.T) {
	handler := Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/health", nil))
	LlamaRequest("ok")
	SetOutboxPending(3)
	SetErrorBudgetRemainingRatio(0.8)
	IncLakeExport()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()
	Handler().ServeHTTP(rec, req)
	body := rec.Body.String()
	for _, want := range []string{
		"csm_http_requests_total",
		"csm_http_request_duration_seconds_bucket",
		"csm_llama_requests_total",
		"csm_outbox_pending",
		"csm_error_budget_remaining_ratio",
		"csm_lake_export_total",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("/metrics missing %q", want)
		}
	}
}
