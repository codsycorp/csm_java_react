package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"csm_server/backend-go/internal/api"
	"csm_server/backend-go/internal/config"
	platformcors "csm_server/backend-go/internal/platform/cors"
	"csm_server/backend-go/internal/platform/health"
	"csm_server/backend-go/internal/platform/logging"
	"csm_server/backend-go/internal/platform/metrics"
	platformotel "csm_server/backend-go/internal/platform/otel"
	"csm_server/backend-go/internal/platform/ratelimit"
	"csm_server/backend-go/internal/platform/secrets"
	"csm_server/backend-go/internal/services"
	"csm_server/backend-go/internal/state"
)

func main() {
	config.LoadEnvFiles()
	cfg := config.LoadFromEnv()

	if err := secrets.ValidateJWTSecret(cfg.JWTSecret, secrets.RequireStrongFromEnv()); err != nil {
		log.Fatalf("security: %v", err)
	}
	if err := platformotel.Init(cfg); err != nil {
		log.Fatalf("otel: %v", err)
	}
	defer platformotel.Shutdown(context.Background())

	if services.IsLlamaWorkerMode() {
		services.RunLlamaWorker(cfg)
		return
	}

	st, err := state.NewAppState(cfg)
	if err != nil {
		log.Fatalf("failed to init app state: %v", err)
	}
	defer st.Shutdown()

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(platformotel.Middleware(cfg))
	if cfg.Platform.MetricsEnabled {
		r.Use(metrics.Middleware)
	}
	if config.HTTPEnableLogger() {
		r.Use(middleware.Logger)
	}
	r.Use(middleware.Compress(5))
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(platformcors.Options(cfg.Platform.CORSAllowedOrigins)))
	if cfg.Platform.AuthRateLimitEnabled {
		lim := ratelimit.New(
			int(cfg.AuthRateLimit.MaxRequestsPerMinute),
			time.Duration(cfg.AuthRateLimit.WindowMs)*time.Millisecond,
		)
		r.Use(ratelimit.AuthMiddleware(lim, "/login", "/refresh-token", "/register"))
	}
	r.Use(api.AuthMiddleware(st))

	r.Get("/live", health.Liveness)
	r.Get("/ready", st.Health.Readiness)
	r.Get("/api/live", health.Liveness)
	r.Get("/api/ready", st.Health.Readiness)

	if cfg.Platform.MetricsEnabled {
		r.Handle(cfg.Platform.MetricsPath, metrics.Handler())
		r.Handle("/api"+cfg.Platform.MetricsPath, metrics.Handler())
	}

	r.Get("/api/monitoring/health", func(w http.ResponseWriter, r *http.Request) {
		api.MonitoringHealth().Write(w)
	})
	r.Get("/monitoring/health", func(w http.ResponseWriter, r *http.Request) {
		api.MonitoringHealth().Write(w)
	})
	r.HandleFunc("/*", api.CatchAll(st))

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	server := &http.Server{Addr: addr, Handler: r}

	go func() {
		logging.Default().Info("server started", map[string]any{
			"addr": addr, "data_dir": cfg.DataDir,
			"metrics": cfg.Platform.MetricsEnabled, "otel": cfg.Platform.OTelEnabled,
			"event_bus": cfg.Platform.EventBusMode,
		})
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	logging.Default().Info("shutdown signal received", nil)

	timeout := time.Duration(cfg.Platform.ShutdownTimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	platformotel.Shutdown(ctx)
	_ = server.Shutdown(ctx)
}
