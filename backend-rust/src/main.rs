use tracing::error;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() {
    csm_server::load_config_env();

    std::panic::set_hook(Box::new(|info| {
        eprintln!("CSM PANIC: {info}");
    }));

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "csm_server=info,tower_http=info,axum=info".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    if let Err(e) = csm_server::run_server().await {
        error!("CSM server failed to start: {:#}", e);
        eprintln!("CSM server failed to start: {:#}", e);
        std::process::exit(1);
    }
}
