package state

import (
	"net/http"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/handlers"
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
	AiHandler     *handlers.AiHandler
}

func NewAppState(cfg config.AppConfig) (*AppState, error) {
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
	aiSeo := services.NewAiSeoService(cfg, llama)
	chat := services.NewChatService(rm)
	socketHub := socket.NewHub()

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
		AuthHandler:   handlers.NewAuthHandler(rm, us, jwt),
		TableHandler:  handlers.NewTableHandler(rm, us, socketHub),
		MenuHandler:   handlers.NewMenuHandler(rm),
		RoleHandler:   handlers.NewRoleHandler(rm),
		HomeHandler:   handlers.NewHomeHandler(rm),
		InitHandler:   handlers.NewInitHandler(rm),
		SeoHandler:    handlers.NewSeoHandler(rm),
		CrmHandler:    handlers.NewCrmHandler(crm),
	}
	st.ApiExtHandler = handlers.NewApiExtHandler(cfg, httpClient, googleIndex, aiSeo)
	st.SocialHandler = handlers.NewSocialHandler(cfg, httpClient, st.CrmHandler)
	st.AiHandler = handlers.NewAiHandler(cfg, llama, rm)
	st.InitHandler.AutoInitDefaultData()

	socketHub.Register(socket.Dependencies{
		Config: cfg, RM: rm, Chat: chat, Llama: llama,
	})
	if err := socketHub.Start(cfg.Socket.Host, cfg.Socket.Port); err != nil {
		return nil, err
	}

	return st, nil
}

func (st *AppState) Shutdown() {
	if st.SocketHub != nil {
		st.SocketHub.Close()
	}
	if st.Llama != nil {
		st.Llama.Shutdown()
	}
	st.RecordManager.ShutdownAll()
}
