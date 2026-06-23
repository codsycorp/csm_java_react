package otel

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"

	"csm_server/backend-go/internal/config"
)

var shutdownFn func(context.Context) error

// Init configures OTLP HTTP tracing when CSM_OTEL_ENABLED=true.
func Init(cfg config.AppConfig) error {
	if !cfg.Platform.OTelEnabled {
		return nil
	}
	endpoint := cfg.Platform.OTelEndpoint
	if endpoint == "" {
		endpoint = "localhost:4318"
	}
	opts := []otlptracehttp.Option{
		otlptracehttp.WithEndpoint(endpoint),
	}
	if cfg.Platform.OTelInsecure {
		opts = append(opts, otlptracehttp.WithInsecure())
	}
	exporter, err := otlptracehttp.New(context.Background(), opts...)
	if err != nil {
		return fmt.Errorf("otel exporter: %w", err)
	}
	res, err := resource.New(context.Background(),
		resource.WithAttributes(attribute.String("service.name", cfg.Platform.ServiceName)),
	)
	if err != nil {
		return fmt.Errorf("otel resource: %w", err)
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	shutdownFn = tp.Shutdown
	log.Printf("OpenTelemetry enabled (endpoint=%s service=%s)", endpoint, cfg.Platform.ServiceName)
	return nil
}

// Middleware wraps HTTP handlers with distributed tracing.
func Middleware(cfg config.AppConfig) func(http.Handler) http.Handler {
	if !cfg.Platform.OTelEnabled {
		return func(next http.Handler) http.Handler { return next }
	}
	return func(next http.Handler) http.Handler {
		return otelhttp.NewHandler(next, cfg.Platform.ServiceName)
	}
}

// Shutdown flushes pending spans.
func Shutdown(ctx context.Context) {
	if shutdownFn == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := shutdownFn(ctx); err != nil {
		log.Printf("otel shutdown: %v", err)
	}
}
