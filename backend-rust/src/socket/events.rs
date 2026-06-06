use std::sync::LazyLock;

use dashmap::DashMap;
use serde_json::{json, Value};
use socketioxide::extract::{Data, SocketRef};
use tracing::info;
use crate::state::AppState;

static ROOM_SESSIONS: LazyLock<DashMap<String, Vec<String>>> = LazyLock::new(DashMap::new);

pub fn register_events(socket: &SocketRef, state: &AppState) {
    socket.on("join", {
        let st = state.clone();
        move |s: SocketRef, Data::<Value>(data)| {
            let st = st.clone();
            async move { handle_join(&st, &s, data).await }
        }
    });

    socket.on("join_room", {
        let st = state.clone();
        move |s: SocketRef, Data::<String>(room)| {
            let st = st.clone();
            async move { handle_join_room(&st, &s, &room).await }
        }
    });

    socket.on("chat", {
        let st = state.clone();
        move |s: SocketRef, Data::<Value>(data)| {
            let st = st.clone();
            async move { handle_chat(&st, &s, data).await }
        }
    });

    socket.on("chat_history", {
        let st = state.clone();
        move |s: SocketRef, Data::<String>(room)| {
            let st = st.clone();
            async move { handle_chat_history(&st, &s, &room).await }
        }
    });

    socket.on("chat_history_guest", {
        let st = state.clone();
        move |s: SocketRef, Data::<Value>(data)| {
            let st = st.clone();
            async move { handle_chat_history_guest(&st, &s, data).await }
        }
    });

    socket.on("chat_history_app", {
        let st = state.clone();
        move |s: SocketRef, Data::<String>(app_id)| {
            let st = st.clone();
            async move { handle_chat_history_app(&st, &s, &app_id).await }
        }
    });

    socket.on("chat_mark_read", move |s: SocketRef, Data::<Value>(data)| async move {
        let _ = data;
        let _ = s.emit("chat_mark_read", &json!({"ok": true}));
    });

    socket.on("chat_mark_all_read", move |s: SocketRef, Data::<String>(room)| async move {
        let _ = room;
        let _ = s.emit("chat_mark_all_read", &json!({"ok": true}));
    });

    socket.on("chat_recall_message", move |s: SocketRef, Data::<Value>(data)| async move {
        let _ = s.broadcast().emit("chat_message_recalled", &data);
    });

    socket.on("user_typing", move |s: SocketRef, Data::<Value>(data)| async move {
        let _ = s.broadcast().emit("user_typing", &data);
    });

    socket.on("broadcast_notification", move |s: SocketRef, Data::<Value>(data)| async move {
        let _ = s.broadcast().emit("notification", &data);
    });

    socket.on("register_guest_phone", move |s: SocketRef, Data::<Value>(data)| async move {
        let _ = s.emit("register_guest_phone", &json!({"ok": true, "data": data}));
    });

    socket.on("chat_list_users", {
        let st = state.clone();
        move |s: SocketRef, Data::<String>(app_id)| {
            let st = st.clone();
            async move {
                let _ = s.emit("chat_list_users", &list_users(&st, &app_id));
            }
        }
    });

    socket.on("chat_guests_list", move |s: SocketRef, Data::<String>(app_id)| async move {
        let _ = app_id;
        let _ = s.emit("chat_guests_list", &json!([]));
    });

    socket.on("chat_list_rooms", move |s: SocketRef, Data::<String>(app_id)| async move {
        let rooms: Vec<String> = ROOM_SESSIONS.iter().map(|e| e.key().clone()).collect();
        let _ = s.emit("chat_list_rooms", &json!({"appId": app_id, "rooms": rooms}));
    });

    socket.on("chat_create_room", move |s: SocketRef, Data::<String>(payload)| async move {
        let _ = s.emit("chat_create_room", &json!({"room": payload, "created": true}));
    });

    socket.on("csm_sign_in", {
        let st = state.clone();
        move |s: SocketRef, Data::<String>(encrypted)| {
            let st = st.clone();
            async move { handle_csm_sign_in(&st, &s, &encrypted).await }
        }
    });

    socket.on("csm_msg_update", move |s: SocketRef, Data::<Value>(data)| async move {
        let _ = s.broadcast().emit("csm_msg_update", &data);
    });

    socket.on("csm_register_an_account", move |s: SocketRef, Data::<String>(encrypted)| async move {
        let _ = encrypted;
        let _ = s.emit("csm_register_an_account", &json!({"ok": true}));
    });

    socket.on("request_chat_history_app_snapshot", {
        let st = state.clone();
        move |s: SocketRef, Data::<String>(app_id)| {
            let st = st.clone();
            async move { handle_chat_history_app(&st, &s, &app_id).await }
        }
    });

    socket.on("chat_list_online_admins", {
        let st = state.clone();
        move |s: SocketRef, Data::<String>(app_id)| {
            let st = st.clone();
            async move {
                let _ = s.emit("chat_list_online_admins", &list_users(&st, &app_id));
            }
        }
    });

    socket.on("chat_list_app_users_presence", {
        let st = state.clone();
        move |s: SocketRef, Data::<String>(app_id)| {
            let st = st.clone();
            async move {
                let _ = s.emit("chat_list_app_users_presence", &json!({"appId": app_id, "online": []}));
            }
        }
    });

    socket.on("chat_list_groups", {
        let st = state.clone();
        move |s: SocketRef, Data::<String>(app_id)| {
            let st = st.clone();
            async move {
                let page = st.record_manager.filter(&app_id, "csm_group_members", &Default::default());
                let _ = s.emit("chat_list_groups", &page.get("data").cloned().unwrap_or(json!([])));
            }
        }
    });

    socket.on_disconnect(|s: SocketRef| async move {
        info!("Socket disconnected: {}", s.id);
    });
}

async fn handle_join(_state: &AppState, socket: &SocketRef, data: Value) {
    let room = data
        .get("room")
        .and_then(|v| v.as_str())
        .unwrap_or("default")
        .to_string();
    let _ = socket.join(room.clone());
    let _ = socket.emit("user_joined", &json!({"room": room.clone(), "sid": socket.id.to_string()}));
}

async fn handle_join_room(_state: &AppState, socket: &SocketRef, room: &str) {
    let room_owned = room.to_string();
    let _ = socket.join(room_owned.clone());
    ROOM_SESSIONS
        .entry(room_owned.clone())
        .or_default()
        .push(socket.id.to_string());
    let _ = socket.emit("user_joined", &json!({"room": room_owned}));
}

async fn handle_chat(state: &AppState, socket: &SocketRef, data: Value) {
    let app_id = data.get("app_id").and_then(|v| v.as_str()).unwrap_or("default");
    if let Some(obj) = data.as_object() {
        let _ = state.chat_service.save_message(app_id, obj.clone());
    }
    let _ = socket.broadcast().emit("message", &data);
}

async fn handle_chat_history(state: &AppState, socket: &SocketRef, room: &str) {
    let history = state.chat_service.get_history("default", room);
    let _ = socket.emit("chat_history", &Value::Object(history));
}

async fn handle_chat_history_guest(state: &AppState, socket: &SocketRef, data: Value) {
    let room = data.get("room").and_then(|v| v.as_str()).unwrap_or("guest");
    handle_chat_history(state, socket, room).await;
}

async fn handle_chat_history_app(state: &AppState, socket: &SocketRef, app_id: &str) {
    let history = state.chat_service.get_history(app_id, "app");
    let _ = socket.emit("chat_history_app_snapshot", &Value::Object(history));
}

async fn handle_csm_sign_in(_state: &AppState, socket: &SocketRef, _encrypted: &str) {
    let _ = socket.emit("csm_sign_in", &json!({"ok": true, "message": "sign-in via socket"}));
}

fn list_users(state: &AppState, app_id: &str) -> Value {
    let page = state.record_manager.filter(app_id, "csm_accounts", &Default::default());
    page.get("data").cloned().unwrap_or(json!([]))
}
