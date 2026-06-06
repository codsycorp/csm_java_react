//! Media/WebRTC stubs — full Kurento port in Phase 6.

use serde_json::{json, Value};

pub struct MediaService;

impl MediaService {
    pub fn call_status() -> Value {
        json!({
            "webrtc": "stub",
            "kurento": "not_configured",
            "message": "Port CallHandler.java + Room.java in Phase 6"
        })
    }

    pub fn room_info(room_id: &str) -> Value {
        json!({ "roomId": room_id, "participants": [], "status": "stub" })
    }
}
