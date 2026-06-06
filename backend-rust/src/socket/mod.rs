mod events;

use socketioxide::extract::SocketRef;
use socketioxide::SocketIo;
use tracing::info;

use crate::state::AppState;

pub async fn start_socket_server(state: AppState, port: u16) -> anyhow::Result<()> {
    let (layer, io) = SocketIo::new_layer();

    io.ns("/", move |socket: SocketRef| {
        let st = state.clone();
        async move {
            info!("Socket connected: {}", socket.id);
            events::register_events(&socket, &st);
        }
    });

    let app = axum::Router::new().layer(layer);
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Socket.IO server listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
