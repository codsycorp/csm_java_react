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

    // Socket.IO layer created first so SocketIo handle can be stored in AppState
    let (socket_layer, socket_io) = socket::new_layer();

    let state = AppState::new(config.clone(), socket_io).await?;
    state.record_manager.init()?;

    // Wire socket event handlers now that AppState is ready
    socket::register(&state.socket_io, state.clone());

    // Seed default schemas in background — must not block HTTP bind (large RocksDB)
    let init = state.init_handler.clone();
    tokio::spawn(async move {
        init.auto_init_default_data();
    });

    // Socket.IO on dedicated port (mirrors Java socket.server.port=15301)
    let socket_addr = SocketAddr::from(([0, 0, 0, 0], config.socket.port));
    let socket_listener = tokio::net::TcpListener::bind(socket_addr).await?;
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
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("HTTP server listening on http://{}", addr);
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
