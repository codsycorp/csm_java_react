mod events;

pub use socketioxide::SocketIo;
pub use socketioxide::layer::SocketIoLayer;
use socketioxide::extract::SocketRef;
use tracing::info;

use crate::state::AppState;

/// Create the socket.io layer + io handle. Call BEFORE AppState::new so the io
/// handle can be stored in AppState for server-side broadcasting.
/// Register event handlers separately via register_events() once AppState exists.
pub fn new_layer() -> (SocketIoLayer, SocketIo) {
    SocketIo::new_layer()
}

/// Wire event handlers onto the "/" namespace. Call after AppState is fully built.
pub fn register(io: &SocketIo, state: AppState) {
    io.ns("/", move |socket: SocketRef| {
        let st = state.clone();
        async move {
            info!("Socket connected: {}", socket.id);
            events::register_events(&socket, &st);
        }
    });
}
