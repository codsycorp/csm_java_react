package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"csm_server/backend-go/internal/api"
	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/services"
	"csm_server/backend-go/internal/state"
)

func main() {
	config.LoadEnvFiles()
	cfg := config.LoadFromEnv()

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
	if config.HTTPEnableLogger() {
		r.Use(middleware.Logger)
	}
	r.Use(middleware.Compress(5))
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowOriginFunc: func(r *http.Request, origin string) bool { return true },
		AllowedMethods:  []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{
			"Accept", "Authorization", "Content-Type", "X-CSRF-Token",
			"csm-token", "X-Refresh-Token", "csm-lang", "X-Client-Id", "X-Requested-With",
		},
		AllowCredentials: true,
		MaxAge:           3600,
	}))
	r.Use(api.AuthMiddleware(st))

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
		log.Printf("CSM Go backend listening on %s (data_dir=%s)", addr, cfg.DataDir)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Println("Shutting down...")
	_ = server.Close()
}
