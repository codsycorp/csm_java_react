use std::sync::Arc;

use reqwest::Client;

use crate::config::AppConfig;
use crate::data::record_manager::RecordManager;
use crate::handlers::{
    auth::AuthHandler, crm::CrmHandler, home::HomeHandler, init::InitHandler, menu::MenuHandler,
    role::RoleHandler, seo::SeoHandler, table::TableHandler,
};
use crate::security::jwt::JwtUtil;
use crate::services::{
    ai::guest_chat::AiGuestWebChatService,
    cache::CacheService, chat::ChatPersistenceService, crm::CrmService,
    crm_analytics::CrmAnalyticsService, google_index::GoogleIndexService,
    llama_cpp::LlamaCppService, permission::PermissionService,
    user::UserService,
};
use crate::socket::SocketIo;

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub record_manager: Arc<RecordManager>,
    pub jwt: Arc<JwtUtil>,
    pub user_service: Arc<UserService>,
    pub cache_service: Arc<CacheService>,
    pub permission_service: Arc<PermissionService>,
    pub crm_service: Arc<CrmService>,
    pub chat_service: Arc<ChatPersistenceService>,
    pub http_client: Client,
    pub llama: LlamaCppService,
    pub auth_handler: Arc<AuthHandler>,
    pub table_handler: Arc<TableHandler>,
    pub crm_handler: Arc<CrmHandler>,
    pub menu_handler: Arc<MenuHandler>,
    pub role_handler: Arc<RoleHandler>,
    pub home_handler: Arc<HomeHandler>,
    pub init_handler: Arc<InitHandler>,
    pub seo_handler: Arc<SeoHandler>,
    pub google_index: Arc<GoogleIndexService>,
    pub guest_chat: Arc<AiGuestWebChatService>,
    /// Socket.IO handle for server-side broadcasting (mirrors Java SocketIOServer inject)
    pub socket_io: Arc<SocketIo>,
}

impl AppState {
    pub async fn new(config: AppConfig, socket_io: SocketIo) -> anyhow::Result<Self> {
        let record_manager = Arc::new(RecordManager::new(config.clone())?);
        let jwt = Arc::new(JwtUtil::new(&config.jwt_secret));
        let user_service = Arc::new(UserService::new(record_manager.clone()));
        let cache_service = Arc::new(CacheService::new(&config).await?);
        let permission_service = Arc::new(PermissionService::new(record_manager.clone()));
        let crm_service = Arc::new(CrmService::new(record_manager.clone()));
        // CRM/RocksDB init deferred to main — avoid blocking or crashing before HTTP bind
        let crm_analytics = Arc::new(CrmAnalyticsService::new(crm_service.clone()));
        let chat_service = Arc::new(ChatPersistenceService::new(record_manager.clone()));

        let socket_io = Arc::new(socket_io);

        let auth_handler = Arc::new(AuthHandler::new(
            record_manager.clone(),
            user_service.clone(),
            jwt.clone(),
        ));
        let table_handler = Arc::new(TableHandler::new(
            record_manager.clone(),
            user_service.clone(),
            chat_service.clone(),
            (*socket_io).clone(),
        ));
        let crm_handler = Arc::new(CrmHandler::new(
            crm_service.clone(),
            crm_analytics.clone(),
            user_service.clone(),
        ));
        let menu_handler = Arc::new(MenuHandler::new(record_manager.clone()));
        let role_handler = Arc::new(RoleHandler::new(record_manager.clone()));
        let home_handler = Arc::new(HomeHandler::new(record_manager.clone()));
        let init_handler = Arc::new(InitHandler::new(record_manager.clone()));
        let seo_handler = Arc::new(SeoHandler::new(record_manager.clone()));

        let llama = LlamaCppService::new(&config);
        let http_client = Client::builder()
            .timeout(std::time::Duration::from_secs(900))
            .build()?;
        let work_dir = std::env::current_dir().unwrap_or_else(|_| config.data_dir.clone());
        let google_index = Arc::new(GoogleIndexService::new(http_client.clone(), work_dir));
        let guest_chat = Arc::new(AiGuestWebChatService::new(
            llama.clone(),
            chat_service.clone(),
        ));

        Ok(Self {
            config,
            record_manager,
            jwt,
            user_service,
            cache_service,
            permission_service,
            crm_service,
            chat_service,
            http_client,
            llama,
            auth_handler,
            table_handler,
            crm_handler,
            menu_handler,
            role_handler,
            home_handler,
            init_handler,
            seo_handler,
            google_index,
            guest_chat,
            socket_io,
        })
    }
}
