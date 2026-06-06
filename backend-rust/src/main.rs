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
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::config::AppConfig;
use crate::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    dotenvy::from_filename("../config.env").ok();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "csm_server=info,tower_http=info,axum=info".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = AppConfig::from_env()?;
    info!(
        "CSM Rust backend starting on {}:{}",
        config.server.host, config.server.port
    );
    info!("Data directory: {}", config.data_dir.display());

    let state = AppState::new(config.clone()).await?;
    state.record_manager.init()?;

    // Seed default schemas in background — must not block HTTP bind (large RocksDB)
    let init = state.init_handler.clone();
    tokio::spawn(async move {
        init.auto_init_default_data();
    });

    let app = build_app(state.clone());

    let addr = SocketAddr::from(([0, 0, 0, 0], config.server.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    // Socket.IO on separate port (mirrors Java socket.server.port)
    let socket_state = state.clone();
    let socket_port = config.socket.port;
    tokio::spawn(async move {
        if let Err(e) = socket::start_socket_server(socket_state, socket_port).await {
            tracing::error!("Socket.IO server error: {e}");
        }
    });

    info!("HTTP server listening on http://{}", addr);
    axum::serve(listener, app).await?;

    Ok(())
}

fn build_app(state: AppState) -> Router {
    // All traffic goes through api::catch_all (API + SSR). Do NOT add a separate web
    // fallback here — it would bypass /login and other bare API paths.
    Router::new()
        .merge(controllers::routes(state.clone()))
        .merge(api::router::api_routes(state.clone()))
        .layer(security::middleware::security_layers())
        .with_state(state)
}
