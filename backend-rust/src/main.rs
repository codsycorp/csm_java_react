mod api;
mod config;
mod controllers;
mod data;
mod error;
mod handlers;
mod model;
mod security;
mod services;
mod socket;
mod state;
mod util;
mod web;

use std::net::SocketAddr;

use axum::Router;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::config::{AppConfig, skip_startup_db_init};
use crate::state::AppState;

fn load_config_env() {
    // Service NSSM/systemd: CSM_HOME + AppDirectory — đảm bảo cwd và config.env đúng
    let home = std::env::var("CSM_HOME").ok().map(std::path::PathBuf::from);

    if let Some(ref home_path) = home {
        if home_path.is_dir() {
            let _ = std::env::set_current_dir(home_path);
        }
        let _ = dotenvy::from_filename(home_path.join("config.env"));
    }
    dotenvy::dotenv().ok();
    dotenvy::from_filename("config.env").ok();
    dotenvy::from_filename("../config.env").ok();

    // Profile overlay (8gb / strong) — giống run-rust-server.sh / start.sh
    let profile = std::env::var("CSM_LOCAL_PROFILE")
        .or_else(|_| std::env::var("AI_LOCAL_MODE"))
        .unwrap_or_default()
        .to_ascii_lowercase();

    let overlay = match profile.as_str() {
        "strong" | "local-strong" => Some("config.local-strong.env"),
        "8gb" | "7b" | "local-8gb" => Some("config.local-8gb.env"),
        _ => None,
    };

    if let Some(name) = overlay {
        let candidates: Vec<std::path::PathBuf> = [
            home.as_ref().map(|h| h.join(name)),
            Some(std::path::PathBuf::from(name)),
            Some(std::path::PathBuf::from("..").join(name)),
        ]
        .into_iter()
        .flatten()
        .collect();

        for path in candidates {
            if path.is_file() {
                let _ = dotenvy::from_filename(&path);
                break;
            }
        }
    }
}

#[tokio::main]
async fn main() {
    load_config_env();

    std::panic::set_hook(Box::new(|info| {
        eprintln!("CSM PANIC: {info}");
    }));

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "csm_server=info,tower_http=info,axum=info".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    if let Err(e) = run().await {
        error!("CSM server failed to start: {:#}", e);
        eprintln!("CSM server failed to start: {:#}", e);
        std::process::exit(1);
    }
}

async fn run() -> anyhow::Result<()> {
    let config = AppConfig::from_env()?;
    info!(
        "CSM Rust backend starting on {}:{}",
        config.server.host, config.server.port
    );
    info!("CSM_HOME={}", std::env::var("CSM_HOME").unwrap_or_else(|_| "(not set)".into()));
    info!("Data directory: {}", config.data_dir.display());
    info!("RocksDB root: {}", config.rocksdb_root.display());

    #[cfg(feature = "local-ai")]
    {
        let model = config
            .ai_local_llama_model_path
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "(default)".into());
        info!(
            "Local AI: model={} ctx={} batch={}/{} threads={} max_tokens={} mmap={} profile={}",
            model,
            config.effective_llama_context_window(),
            config.ai_local_llama_batch_size,
            config.ai_local_llama_ubatch_size,
            config.ai_local_llama_threads,
            config.effective_llama_max_tokens(),
            config.ai_local_llama_use_mmap,
            std::env::var("CSM_LOCAL_PROFILE").unwrap_or_else(|_| "default".into())
        );
    }

    // Socket.IO layer created first so SocketIo handle can be stored in AppState
    let (socket_layer, socket_io) = socket::new_layer();

    info!("Initializing application state...");
    let state = AppState::new(config.clone(), socket_io).await?;
    info!("Application state ready");
    state.record_manager.init()?;

    // Wire socket event handlers now that AppState is ready
    socket::register(&state.socket_io, state.clone());

    // Socket.IO on dedicated port (mirrors Java socket.server.port=15301)
    let socket_addr = SocketAddr::from(([0, 0, 0, 0], config.socket.port));
    let socket_listener = tokio::net::TcpListener::bind(socket_addr).await.map_err(|e| {
        anyhow::anyhow!(
            "Socket.IO bind failed on port {} (port in use? stop Java/other csm_server): {}",
            config.socket.port,
            e
        )
    })?;
    info!("Socket.IO server listening on :{}", config.socket.port);
    let socket_app = Router::new().layer(socket_layer);
    tokio::spawn(async move {
        if let Err(e) = axum::serve(socket_listener, socket_app).await {
            tracing::error!("Socket.IO server error: {}", e);
        }
    });

    // HTTP API server on main port
    let http_app = build_app(state.clone());
    let addr = SocketAddr::from(([0, 0, 0, 0], config.server.port));
    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| {
        anyhow::anyhow!(
            "HTTP bind failed on port {} (port in use? stop Java/other csm_server): {}",
            config.server.port,
            e
        )
    })?;
    info!("HTTP server listening on http://{}", addr);

    // RocksDB init SAU khi bind port — service NSSM co thoi gian bao RUNNING
    if skip_startup_db_init() {
        info!("CSM_SKIP_STARTUP_DB_INIT=1 — bo qua CRM/schema init luc khoi dong");
    } else {
        let crm_service = state.crm_service.clone();
        let init_handler = state.init_handler.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(15)).await;
            tracing::info!("Background DB init starting (after 15s delay)...");
            let _ = tokio::task::spawn_blocking(move || {
                let crm_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    crm_service.initialize_tables();
                }));
                match crm_result {
                    Ok(()) => tracing::info!("CRM tables ready"),
                    Err(_) => tracing::error!(
                        "CRM init panicked — dat CSM_SKIP_STARTUP_DB_INIT=1 hoac stop Java service"
                    ),
                }

                let init_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    init_handler.auto_init_default_data();
                }));
                match init_result {
                    Ok(()) => tracing::info!("Default schema init finished"),
                    Err(_) => tracing::error!("Default schema init panicked"),
                }
                tracing::info!("Background DB init complete");
            })
            .await;
        });
    }

    axum::serve(listener, http_app).await?;

    Ok(())
}

fn build_app(state: AppState) -> Router {
    Router::new()
        .merge(controllers::routes(state.clone()))
        .merge(api::router::api_routes(state.clone()))
        .layer(security::middleware::security_layers())
        .with_state(state)
}
