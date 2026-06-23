package state

import (
	"context"
	"net/http"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/handlers"
	"csm_server/backend-go/internal/platform/audit"
	"csm_server/backend-go/internal/platform/dataplatform"
	"csm_server/backend-go/internal/platform/embeddings"
	"csm_server/backend-go/internal/platform/events"
	"csm_server/backend-go/internal/platform/governance"
	"csm_server/backend-go/internal/platform/health"
	"csm_server/backend-go/internal/platform/logging"
	"csm_server/backend-go/internal/platform/metrics"
	"csm_server/backend-go/internal/platform/slo"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/services"
	"csm_server/backend-go/internal/socket"
)

type AppState struct {
	Config        config.AppConfig
	RecordManager *data.RecordManager
	JWT           *security.JWTUtil
	UserService   *services.UserService
	CrmService    *services.CrmService
	ChatService   *services.ChatService
	SocketHub     *socket.Hub
	HTTPClient    *http.Client
	GoogleIndex   *services.GoogleIndexService
	Llama         *services.LlamaService
	AiSeo         *services.AiSeoService
	Embeddings    *embeddings.Provider
	EventBus      events.Bus
	Audit         *audit.Store
	DataPlatform  *dataplatform.Runtime
	ErrorBudget   *slo.BudgetTracker
	Health        *health.Registry

	AuthHandler   *handlers.AuthHandler
	TableHandler  *handlers.TableHandler
	MenuHandler   *handlers.MenuHandler
	RoleHandler   *handlers.RoleHandler
	HomeHandler   *handlers.HomeHandler
	InitHandler   *handlers.InitHandler
	SeoHandler    *handlers.SeoHandler
	CrmHandler    *handlers.CrmHandler
	ApiExtHandler *handlers.ApiExtHandler
	SocialHandler *handlers.SocialHandler
	AiHandler         *handlers.AiHandler
	GovernanceHandler *handlers.GovernanceHandler
}

func NewAppState(cfg config.AppConfig) (*AppState, error) {
	logging.Configure(cfg.Platform.StructuredLogs, cfg.Platform.ServiceName)

	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		return nil, err
	}
	rm.Init()

	jwt := security.NewJWTUtil(cfg.JWTSecret)
	us := services.NewUserService(rm)
	crm := services.NewCrmService(rm)
	httpClient := &http.Client{Timeout: 900 * time.Second}
	googleIndex := services.NewGoogleIndexService(cfg, httpClient)
	llama := services.NewLlamaService(cfg)
	embedProvider := embeddings.NewProvider(cfg, llama)
	rm.SetVectorEmbedFunc(embedProvider.EmbedFunc)

	aiSeo := services.NewAiSeoService(cfg, llama)
	chat := services.NewChatService(rm)
	socketHub := socket.NewHub()

	auditStore, err := audit.OpenStore(cfg)
	if err != nil {
		return nil, err
	}
	go auditStore.PurgeExpired()

	eventBus := events.NewBus(cfg)
	dp, err := dataplatform.Bootstrap(cfg, eventBus)
	if err != nil {
		return nil, err
	}
	healthReg := health.NewRegistry()
	healthReg.Register(health.PebbleChecker{Probe: rm.Ping})
	healthReg.Register(health.LlamaChecker{
		Available: llama.IsAvailable,
		OnDisk:    llama.ModelOnDisk,
	})
	if strings.EqualFold(cfg.Platform.EventBusMode, "redis") {
		healthReg.Register(health.RedisChecker{Ping: func(ctx context.Context) error {
			return events.RedisPing(cfg)
		}})
	}
	metrics.SetComponentReady("pebble", true)
	metrics.SetComponentReady("llama", llama.IsAvailable())
	if dp.Outbox != nil && dp.Outbox.Enabled() {
		metrics.SetComponentReady("outbox", true)
	}
	metrics.SetBudgetTracker(slo.NewBudgetTracker(0, 0))
	var dsrSvc *governance.DSRService
	if cfg.Platform.GDPRDSREnabled {
		dsrSvc = governance.NewDSRService(rm)
	}

	st := &AppState{
		Config:        cfg,
		RecordManager: rm,
		JWT:           jwt,
		UserService:   us,
		CrmService:    crm,
		ChatService:   chat,
		SocketHub:     socketHub,
		HTTPClient:    httpClient,
		GoogleIndex:   googleIndex,
		Llama:         llama,
		AiSeo:         aiSeo,
		Embeddings:    embedProvider,
		EventBus:      eventBus,
		Audit:         auditStore,
		DataPlatform:  dp,
		ErrorBudget:   nil,
		Health:        healthReg,
		AuthHandler:   handlers.NewAuthHandler(rm, us, jwt),
		TableHandler:  handlers.NewTableHandler(rm, us, socketHub),
		MenuHandler:   handlers.NewMenuHandler(rm),
		RoleHandler:   handlers.NewRoleHandler(rm),
		HomeHandler:   handlers.NewHomeHandler(rm),
		InitHandler:   handlers.NewInitHandler(rm),
		SeoHandler:    handlers.NewSeoHandler(rm),
		CrmHandler:    handlers.NewCrmHandler(crm),
	}
	st.TableHandler.SetAuditStore(auditStore)
	st.TableHandler.SetEventBus(eventBus)
	if dp.Outbox != nil {
		st.TableHandler.SetOutbox(dp.Outbox)
	}

	st.ApiExtHandler = handlers.NewApiExtHandler(cfg, httpClient, googleIndex, aiSeo)
	st.SocialHandler = handlers.NewSocialHandler(cfg, httpClient, st.CrmHandler)
	st.AiHandler = handlers.NewAiHandler(cfg, llama, rm)
	st.GovernanceHandler = handlers.NewGovernanceHandler(rm, dsrSvc, auditStore, dp.Catalog, dp.Lineage, dp.Lake)
	st.InitHandler.AutoInitDefaultData()

	socketHub.Register(socket.Dependencies{
		Config: cfg, RM: rm, Chat: chat, Llama: llama,
	})
	if err := socketHub.Start(cfg.Socket.Host, cfg.Socket.Port); err != nil {
		return nil, err
	}

	eventBus.Subscribe("table.mutation", func(ctx context.Context, ev events.Event) error {
		logging.Default().Info("table mutation event", ev.Payload)
		return nil
	})

	return st, nil
}

func (st *AppState) Shutdown() {
	if st.SocketHub != nil {
		st.SocketHub.Close()
	}
	if st.Llama != nil {
		st.Llama.Shutdown()
	}
	if st.Audit != nil {
		st.Audit.Close()
	}
	if st.DataPlatform != nil {
		st.DataPlatform.Shutdown()
	}
	if st.EventBus != nil {
		_ = st.EventBus.Close()
	}
	st.RecordManager.ShutdownAll()
}
