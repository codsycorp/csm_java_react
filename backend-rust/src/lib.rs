pub mod api;
pub mod config;
pub mod controllers;
pub mod data;
pub mod error;
pub mod handlers;
pub mod model;
pub mod security;
pub mod services;
pub mod socket;
pub mod state;
pub mod util;
pub mod web;

use std::net::SocketAddr;

use axum::Router;
use tracing::info;

use crate::config::{AppConfig, skip_startup_db_init};
use crate::state::AppState;

pub fn load_config_env() {
    let repo_root = infer_repo_root();

    if std::env::var("CSM_HOME").is_err() {
        let backend = repo_root.join("backend");
        if backend.is_dir() {
            std::env::set_var("CSM_HOME", backend.display().to_string());
        }
    }

    let home = std::env::var("CSM_HOME").ok().map(std::path::PathBuf::from);

    // Repo-level config first — mirrors run-go-server.sh / run-rust-server.sh
    let _ = dotenvy::from_filename(repo_root.join("config.env"));

    if let Some(ref home_path) = home {
        if home_path.is_dir() {
            let _ = std::env::set_current_dir(home_path);
        }
        let _ = dotenvy::from_filename(home_path.join("config.env"));
    }
    dotenvy::dotenv().ok();
    dotenvy::from_filename("config.env").ok();
    dotenvy::from_filename("../config.env").ok();

    let mut profile = std::env::var("CSM_LOCAL_PROFILE")
        .or_else(|_| std::env::var("AI_LOCAL_MODE"))
        .unwrap_or_default()
        .to_ascii_lowercase();
    if profile.is_empty() {
        profile = if cfg!(target_os = "macos") {
            "m1".into()
        } else {
            "8gb".into()
        };
    }

    let overlay = match profile.as_str() {
        "strong" | "local-strong" => Some("config.local-strong.env"),
        "m1" | "m1-16gb" | "local-m1" => Some("config.local-m1.env"),
        "8gb" | "7b" | "local-8gb" => Some("config.local-8gb.env"),
        _ => None,
    };

    if let Some(name) = overlay {
        let candidates: Vec<std::path::PathBuf> = [
            Some(repo_root.join(name)),
            home.as_ref().map(|h| h.join(name)),
            Some(std::path::PathBuf::from(name)),
            Some(std::path::PathBuf::from("..").join(name)),
        ]
        .into_iter()
        .flatten()
        .collect();

        for path in candidates {
            if path.is_file() {
                let _ = dotenvy::from_filename_override(&path);
                break;
            }
        }
    }

    // Default data paths when not set by config.env / launcher (Go run-*.sh parity)
    if std::env::var("APP_DATA_DIR").is_err() {
        if let Some(ref home_path) = home {
            std::env::set_var(
                "APP_DATA_DIR",
                home_path.join("csm_datas").display().to_string(),
            );
        }
    }
    if std::env::var("CSM_NATIVE_DATA_DIR").is_err() {
        if let Ok(app_data) = std::env::var("APP_DATA_DIR") {
            std::env::set_var(
                "CSM_NATIVE_DATA_DIR",
                format!("{app_data}/native"),
            );
        }
    }
    if std::env::var("CSM_PEBBLE_ROOT").is_err() {
        if let Ok(native) = std::env::var("CSM_NATIVE_DATA_DIR") {
            std::env::set_var("CSM_PEBBLE_ROOT", format!("{native}/pebble"));
        }
    }
    if std::env::var("CSM_VECTOR_DIR").is_err() {
        if let Ok(native) = std::env::var("CSM_NATIVE_DATA_DIR") {
            std::env::set_var("CSM_VECTOR_DIR", format!("{native}/vector/qdrant"));
        }
    }

    load_ai_env_overlays(&repo_root, &home, &profile);
    config::prepare_ai_env_defaults();
}

fn env_flag_true(key: &str, default: bool) -> bool {
    match std::env::var(key) {
        Ok(v) => {
            let v = v.trim().to_ascii_lowercase();
            v == "1" || v == "true" || v == "yes"
        }
        Err(_) => default,
    }
}

fn load_ai_env_overlays(
    repo_root: &std::path::Path,
    home: &Option<std::path::PathBuf>,
    profile: &str,
) {
    if !env_flag_true("AI_LOCAL_PROMPT_BUDGET_DISABLED", false) {
        return;
    }

    let names: &[&str] = match profile {
        "8gb" | "7b" | "local-8gb" => &["config.ai-local-max-8gb.env", "config.ai-local-max.env"],
        _ => &["config.ai-local-max.env"],
    };

    for name in names {
        let candidates: Vec<std::path::PathBuf> = [
            Some(repo_root.join(name)),
            home.as_ref().map(|h| h.join(name)),
            Some(std::path::PathBuf::from(name)),
            Some(std::path::PathBuf::from("..").join(name)),
        ]
        .into_iter()
        .flatten()
        .collect();

        for path in candidates {
            if path.is_file() {
                let _ = dotenvy::from_filename_override(&path);
                break;
            }
        }
    }
}

fn infer_repo_root() -> std::path::PathBuf {
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.file_name().is_some_and(|n| n == "backend-rust") {
            if let Some(parent) = cwd.parent() {
                return parent.to_path_buf();
            }
        }
        if cwd.join("config.env").is_file() {
            return cwd;
        }
        if let Some(parent) = cwd.parent() {
            if parent.join("config.env").is_file() {
                return parent.to_path_buf();
            }
        }
    }
    std::path::PathBuf::from(".")
}

pub async fn run_server() -> anyhow::Result<()> {
    let config = AppConfig::from_env()?;
    info!(
        "CSM Rust backend starting on {}:{}",
        config.server.host, config.server.port
    );
    config.log_storage_layout();

    #[cfg(feature = "local-ai")]
    {
        let model = config
            .ai_local_llama_model_path
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "(default)".into());
        info!(
            "Local AI: model={} ctx={} batch={}/{} threads={} max_tokens={} mmap={}",
            model,
            config.effective_llama_context_window(),
            config.effective_llama_batch_size(),
            config.ai_local_llama_ubatch_size,
            config.ai_local_llama_threads,
            config.effective_llama_max_tokens(),
            config.ai_local_llama_use_mmap,
        );
    }

    let (socket_layer, socket_io) = socket::new_layer();

    info!("Initializing application state...");
    let state = AppState::new(config.clone(), socket_io).await?;
    info!("Application state ready");
    state.record_manager.init()?;
    state.record_manager.spawn_startup_reindex();

    socket::register(&state.socket_io, state.clone());

    let socket_addr = SocketAddr::from(([0, 0, 0, 0], config.socket.port));
    let socket_listener = tokio::net::TcpListener::bind(socket_addr).await.map_err(|e| {
        anyhow::anyhow!(
            "Socket.IO bind failed on port {} (port in use?): {}",
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

    let http_app = build_app(state.clone());
    let addr = SocketAddr::from(([0, 0, 0, 0], config.server.port));
    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| {
        anyhow::anyhow!(
            "HTTP bind failed on port {} (port in use?): {}",
            config.server.port,
            e
        )
    })?;
    info!("HTTP server listening on http://{}", addr);

    if skip_startup_db_init() {
        info!("CSM_SKIP_STARTUP_DB_INIT=1 — skipping CRM/schema init");
    } else {
        let crm_service = state.crm_service.clone();
        let init_handler = state.init_handler.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(15)).await;
            tracing::info!("Background DB init starting (after 15s delay)...");
            let _ = tokio::task::spawn_blocking(move || {
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    crm_service.initialize_tables();
                }));
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    init_handler.auto_init_default_data();
                }));
                tracing::info!("Background DB init complete");
            })
            .await;
        });
    }

    axum::serve(listener, http_app).await?;
    Ok(())
}

pub fn build_app(state: AppState) -> Router {
    Router::new()
        .merge(controllers::routes(state.clone()))
        .merge(api::router::api_routes(state.clone()))
        .layer(security::middleware::security_layers())
        .with_state(state)
}
