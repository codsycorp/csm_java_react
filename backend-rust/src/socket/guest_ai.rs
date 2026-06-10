//! Guest web chat AI orchestration — mirrors Java SocketIOConfig guest AI lane.

use std::sync::{LazyLock};
use std::time::Duration;

use dashmap::DashMap;
use serde_json::{json, Map, Value};
use socketioxide::extract::SocketRef;
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::services::ai::guest_chat::normalize_locale;
use crate::state::AppState;

const AI_ASSISTANT_USER_ID: &str = "ai_assistant";
const DEFAULT_SUPPORT_USERNAME: &str = "Tu van vien";

static SESSION_APP_IDS: LazyLock<DashMap<String, String>> = LazyLock::new(DashMap::new);
static SESSION_USERNAMES: LazyLock<DashMap<String, String>> = LazyLock::new(DashMap::new);
static SESSION_GUEST_IDENTITIES: LazyLock<DashMap<String, String>> = LazyLock::new(DashMap::new);
static SESSION_GUEST_PHONES: LazyLock<DashMap<String, String>> = LazyLock::new(DashMap::new);
static SESSION_GUEST_LOCALES: LazyLock<DashMap<String, String>> = LazyLock::new(DashMap::new);
static SESSION_IS_ADMIN: LazyLock<DashMap<String, bool>> = LazyLock::new(DashMap::new);
static GUEST_IDENTITY_BY_APP_PHONE: LazyLock<DashMap<String, String>> = LazyLock::new(DashMap::new);
static WELCOME_TIMESTAMP_BY_GUEST: LazyLock<DashMap<String, i64>> = LazyLock::new(DashMap::new);
static PENDING_WELCOME_TASKS: LazyLock<DashMap<String, JoinHandle<()>>> = LazyLock::new(DashMap::new);
static PENDING_NO_REPLY_TASKS: LazyLock<DashMap<String, JoinHandle<()>>> = LazyLock::new(DashMap::new);

pub async fn process_join(state: &AppState, socket: &SocketRef, data: Value) {
    let obj = data.as_object().cloned().unwrap_or_default();
    let sid = socket.id.to_string();
    let app_id = get_str(&obj, &["appId", "app_id"]).unwrap_or_else(|| "csm".into());
    let username = get_str(&obj, &["username"]).unwrap_or_else(|| "Guest".into());
    let guest_phone = get_str(&obj, &["guestPhone", "guest_phone"]);
    let guest_session_id = get_str(&obj, &["guestSessionId", "guest_session_id"]);
    let locale = normalize_locale(get_str(&obj, &["locale"]).as_deref()).unwrap_or("vi");
    let is_admin = obj.get("isAdmin").and_then(|v| v.as_bool()).unwrap_or(false);

    SESSION_USERNAMES.insert(sid.clone(), username.clone());
    SESSION_APP_IDS.insert(sid.clone(), app_id.clone());

    if is_admin {
        SESSION_IS_ADMIN.insert(sid.clone(), true);
        let master_room = format!("app:{app_id}");
        let _ = socket.join(master_room.clone());
        let _ = socket.emit("user_joined", &json!({"room": master_room, "username": username}));
        info!("Admin joined master room {master_room}");
        return;
    }

    if guest_session_id.is_some() || guest_phone.is_some() {
        SESSION_IS_ADMIN.insert(sid.clone(), false);
        let guest_identity = resolve_canonical_guest_identity(
            &app_id,
            guest_session_id.as_deref(),
            guest_phone.as_deref(),
            &sid,
        );
        let private_room = format!("guest:{app_id};{guest_identity}");
        let master_room = format!("app:{app_id}");

        if let Some(ref phone) = guest_phone {
            SESSION_GUEST_PHONES.insert(sid.clone(), phone.clone());
            remember_guest_phone_identity(&app_id, Some(phone.as_str()), &guest_identity);
        }
        SESSION_GUEST_IDENTITIES.insert(sid.clone(), guest_identity.clone());
        SESSION_GUEST_LOCALES.insert(sid.clone(), locale.to_string());

        let _ = socket.join(private_room.clone());
        let _ = socket.join(master_room.clone());
        let _ = socket.emit("user_joined", &json!({"room": private_room, "username": username}));
        info!("Guest joined {private_room} + {master_room}");

        trigger_welcome_on_guest_join(state, &app_id, &guest_identity, guest_phone.as_deref(), Some(locale)).await;
        return;
    }

    let room = get_str(&obj, &["room"]).unwrap_or_else(|| app_id.clone());
    let _ = socket.join(room.clone());
    let _ = socket.emit("user_joined", &json!({"room": room}));
}

pub async fn process_chat(state: &AppState, socket: &SocketRef, mut data: Value) {
    let sid = socket.id.to_string();
    let mut obj = match data.as_object_mut() {
        Some(o) => std::mem::take(o),
        None => Map::new(),
    };

    let app_id = get_str(&obj, &["appId", "app_id"])
        .or_else(|| SESSION_APP_IDS.get(&sid).map(|v| v.clone()))
        .or_else(|| parse_app_id_from_room(get_str(&obj, &["room"]).as_deref()))
        .unwrap_or_else(|| "csm".into());

    let is_admin = obj.get("isAdmin").and_then(|v| v.as_bool()).unwrap_or(false)
        || SESSION_IS_ADMIN.get(&sid).map(|v| *v).unwrap_or(false);
    let user_id = get_str(&obj, &["userId", "user_id"]);
    let guest_phone = get_str(&obj, &["guestPhone", "guest_phone"])
        .or_else(|| SESSION_GUEST_PHONES.get(&sid).map(|v| v.clone()));
    let guest_session_id = get_str(&obj, &["guestSessionId", "guest_session_id"])
        .or_else(|| SESSION_GUEST_IDENTITIES.get(&sid).map(|v| v.clone()));
    let room = get_str(&obj, &["room"]).unwrap_or_default();
    let message = get_str(&obj, &["message"]).unwrap_or_default();
    let session_locale = SESSION_GUEST_LOCALES.get(&sid).map(|v| v.clone());
    let preferred_locale = normalize_locale(
        get_str(&obj, &["locale"])
            .as_deref()
            .or(session_locale.as_deref()),
    )
    .unwrap_or("vi");

    let guest_context = room.starts_with("guest:") || user_id.is_none();

    obj.insert("appId".into(), json!(app_id.clone()));

    if is_admin && guest_context {
        let target = resolve_canonical_guest_identity(
            &app_id,
            guest_session_id.as_deref(),
            guest_phone.as_deref(),
            &sid,
        );
        cancel_no_reply_task(&app_id, &target);
    } else if user_id.is_none() {
        let guest_identity = resolve_canonical_guest_identity(
            &app_id,
            guest_session_id.as_deref(),
            guest_phone.as_deref(),
            &sid,
        );
        cancel_welcome_task(&app_id, &guest_identity);

        obj.insert("guestSessionId".into(), json!(guest_identity.clone()));
        obj.insert("username".into(), json!("Khach hang"));
        obj.insert("room".into(), json!(format!("guest:{app_id};{guest_identity}")));
        obj.insert("locale".into(), json!(preferred_locale));

        if guest_phone.is_none() {
            if let Some(p) = SESSION_GUEST_PHONES.get(&sid) {
                obj.insert("guestPhone".into(), json!(p.clone()));
            }
        }

        let ts = obj
            .get("timestamp")
            .and_then(|v| v.as_i64())
            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
        if !obj.contains_key("timestamp") {
            obj.insert("timestamp".into(), json!(ts));
        }

        let _ = state.chat_service.save_message(&app_id, obj.clone());
        let _ = socket.broadcast().emit("message", &Value::Object(obj.clone()));

        if !message.is_empty() {
            schedule_no_reply_fallback(
                state,
                app_id.clone(),
                guest_identity,
                guest_phone,
                message,
                ts,
                preferred_locale,
            )
            .await;
        }
        return;
    }

    if !obj.contains_key("timestamp") {
        obj.insert("timestamp".into(), json!(chrono::Utc::now().timestamp_millis()));
    }

    let _ = state.chat_service.save_message(&app_id, obj.clone());
    let _ = socket.broadcast().emit("message", &Value::Object(obj));
}

pub async fn process_register_guest_phone(state: &AppState, socket: &SocketRef, data: Value) {
    let obj = data.as_object().cloned().unwrap_or_default();
    let app_id = get_str(&obj, &["appId", "app_id"]).unwrap_or_default();
    let old_identity = get_str(&obj, &["guestSessionId", "guest_session_id"]).unwrap_or_default();
    let phone = get_str(&obj, &["phone"]).unwrap_or_default();

    if app_id.is_empty() || old_identity.is_empty() || phone.is_empty() {
        let _ = socket.emit(
            "register_guest_phone",
            &json!({"success": false, "error": "Missing required fields"}),
        );
        return;
    }

    let rebound = state
        .chat_service
        .rebind_guest_phone(&app_id, &old_identity, &phone);
    remember_guest_phone_identity(&app_id, Some(&phone), &phone);
    SESSION_GUEST_IDENTITIES.insert(socket.id.to_string(), phone.clone());

    let permanent_room = format!("guest:{app_id};{phone}");
    let _ = socket.join(permanent_room.clone());

    let _ = socket.emit(
        "register_guest_phone",
        &json!({
            "success": true,
            "phone": phone,
            "permanentRoom": permanent_room,
            "rebound": rebound,
        }),
    );
}

pub fn list_guest_sessions(state: &AppState, app_id: &str) -> Value {
    json!(state.chat_service.get_guest_sessions_by_app_id(app_id))
}

async fn trigger_welcome_on_guest_join(
    state: &AppState,
    app_id: &str,
    guest_identity: &str,
    guest_phone: Option<&str>,
    preferred_locale: Option<&str>,
) {
    if guest_phone.is_some() && !guest_phone.unwrap_or("").is_empty() {
        info!("Skip welcome — guest already has phone appId={app_id}");
        return;
    }

    let history = state.chat_service.get_history_by_guest_identity(
        app_id,
        Some(guest_identity),
        guest_phone,
        5,
    );
    if !history.is_empty() {
        info!("Skip welcome — guest has history appId={app_id}");
        return;
    }

    cancel_welcome_task(app_id, guest_identity);

    let pending_w = PENDING_WELCOME_TASKS.len();
    let pending_n = PENDING_NO_REPLY_TASKS.len();
    if state
        .guest_chat
        .is_scheduling_saturated(pending_w, pending_n)
    {
        warn!("Guest AI scheduling saturated — skip welcome appId={app_id}");
        return;
    }

    let key = guest_key(app_id, guest_identity);
    let state = state.clone();
    let app_id = app_id.to_string();
    let guest_identity = guest_identity.to_string();
    let locale = preferred_locale.unwrap_or("vi").to_string();
    let delay = state.guest_chat.welcome_delay_ms();

    let handle = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(delay)).await;

        let history = state.chat_service.get_history_by_guest_identity(
            &app_id,
            Some(&guest_identity),
            None,
            5,
        );
        if !history.is_empty() {
            return;
        }

        if has_recent_auto_welcome(&app_id, &guest_identity, state.guest_chat.welcome_cooldown_ms()) {
            return;
        }

        let fallback = state.guest_chat.fallback_welcome(Some(&locale));
        let prompt = state
            .guest_chat
            .build_welcome_prompt(&app_id, None, Some(&locale));
        let gk = guest_key(&app_id, &guest_identity);
        let text = state
            .guest_chat
            .generate_reply(&prompt, &fallback, "guest_welcome", Some(&gk))
            .await;

        dispatch_ai_message_to_guest(
            &state,
            &app_id,
            &guest_identity,
            None,
            &text,
            "ai_auto_welcome",
            Some(&locale),
        )
        .await;
    });

    PENDING_WELCOME_TASKS.insert(key, handle);
}

async fn schedule_no_reply_fallback(
    state: &AppState,
    app_id: String,
    guest_identity: String,
    guest_phone: Option<String>,
    guest_message: String,
    guest_message_ts: i64,
    preferred_locale: &str,
) {
    cancel_no_reply_task(&app_id, &guest_identity);

    let fallback = state
        .guest_chat
        .fallback_no_admin_reply(&guest_message, Some(preferred_locale));

    let pending_w = PENDING_WELCOME_TASKS.len();
    let pending_n = PENDING_NO_REPLY_TASKS.len();
    if state
        .guest_chat
        .is_scheduling_saturated(pending_w, pending_n)
    {
        dispatch_ai_message_to_guest(
            state,
            &app_id,
            &guest_identity,
            guest_phone.as_deref(),
            &fallback,
            "ai_auto_no_admin_reply_fallback",
            Some(preferred_locale),
        )
        .await;
        return;
    }

    let key = guest_key(&app_id, &guest_identity);
    let state = state.clone();
    let locale = preferred_locale.to_string();
    let delay = state.guest_chat.no_admin_reply_delay_ms();

    let handle = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(delay)).await;

        if has_human_admin_reply_after(
            &state,
            &app_id,
            &guest_identity,
            guest_phone.as_deref(),
            guest_message_ts,
        ) {
            info!("Skip no-reply AI — admin already replied appId={app_id}");
            return;
        }

        let prompt = state.guest_chat.build_no_admin_reply_prompt(
            &app_id,
            &guest_identity,
            guest_phone.as_deref(),
            &guest_message,
            Some(&locale),
        );
        let gk = guest_key(&app_id, &guest_identity);
        let text = state
            .guest_chat
            .generate_reply(&prompt, &fallback, "guest_no_admin_reply", Some(&gk))
            .await;

        dispatch_ai_message_to_guest(
            &state,
            &app_id,
            &guest_identity,
            guest_phone.as_deref(),
            &text,
            "ai_auto_no_admin_reply",
            Some(&locale),
        )
        .await;
    });

    PENDING_NO_REPLY_TASKS.insert(key, handle);
}

async fn dispatch_ai_message_to_guest(
    state: &AppState,
    app_id: &str,
    guest_identity: &str,
    guest_phone: Option<&str>,
    message_text: &str,
    event_type: &str,
    preferred_locale: Option<&str>,
) {
    if app_id.is_empty() || guest_identity.is_empty() || message_text.trim().is_empty() {
        return;
    }

    let mut safe_text = state.guest_chat.sanitize_auto_reply_text(
        message_text,
        event_type,
        preferred_locale,
    );
    if safe_text.is_empty() {
        safe_text = state.guest_chat.fallback_welcome(preferred_locale);
    }
    if safe_text.chars().count() > 280 {
        safe_text = safe_text.chars().take(280).collect();
    }

    let private_room = format!("guest:{app_id};{guest_identity}");
    let master_room = format!("app:{app_id}");
    let ts = chrono::Utc::now().timestamp_millis();
    let locale = preferred_locale.unwrap_or("vi");

    let mut ai_msg = Map::new();
    ai_msg.insert("room".into(), json!(private_room));
    ai_msg.insert("username".into(), json!(DEFAULT_SUPPORT_USERNAME));
    ai_msg.insert("userId".into(), json!(AI_ASSISTANT_USER_ID));
    ai_msg.insert("isAdmin".into(), json!(true));
    ai_msg.insert("appId".into(), json!(app_id));
    ai_msg.insert("guestSessionId".into(), json!(guest_identity));
    ai_msg.insert("to".into(), json!(guest_identity));
    ai_msg.insert("locale".into(), json!(locale));
    ai_msg.insert("eventType".into(), json!(event_type));
    ai_msg.insert("message".into(), json!(safe_text));
    ai_msg.insert("timestamp".into(), json!(ts));
    if let Some(p) = guest_phone.filter(|s| !s.is_empty()) {
        ai_msg.insert("guestPhone".into(), json!(p));
    }

    let _ = state.chat_service.save_message(app_id, ai_msg.clone());
    let payload = Value::Object(ai_msg);
    let _ = state.socket_io.to(private_room.clone()).emit("message", &payload);
    let _ = state.socket_io.to(master_room.clone()).emit("message", &payload);

    let admin_alert = json!({
        "room": master_room,
        "username": "He thong",
        "userId": AI_ASSISTANT_USER_ID,
        "isAdmin": true,
        "appId": app_id,
        "guestSessionId": guest_identity,
        "guestPhone": guest_phone,
        "locale": locale,
        "eventType": "guest_auto_welcome_alert",
        "message": "Khach moi vua vao, he thong da gui loi chao tu dong. Admin co the chu dong tu van ngay.",
        "timestamp": ts,
    });
    let _ = state.socket_io.to(master_room).emit("notification", &admin_alert);

    WELCOME_TIMESTAMP_BY_GUEST.insert(guest_key(app_id, guest_identity), ts);
    info!("AI auto reply sent appId={app_id} guest={guest_identity} event={event_type}");
}

fn has_human_admin_reply_after(
    state: &AppState,
    app_id: &str,
    guest_identity: &str,
    guest_phone: Option<&str>,
    guest_message_ts: i64,
) -> bool {
    let history = state.chat_service.get_history_by_guest_identity(
        app_id,
        Some(guest_identity),
        guest_phone,
        40,
    );
    for msg in history {
        let ts = msg
            .get("timestamp")
            .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|n| n as i64)))
            .unwrap_or(0);
        if ts <= guest_message_ts {
            continue;
        }
        if !msg.get("isAdmin").and_then(|v| v.as_bool()).unwrap_or(false) {
            continue;
        }
        let event_type = msg.get("eventType").and_then(|v| v.as_str()).unwrap_or("");
        if event_type.starts_with("ai_auto_") {
            continue;
        }
        let sender = msg.get("userId").and_then(|v| v.as_str()).unwrap_or("");
        if sender.eq_ignore_ascii_case(AI_ASSISTANT_USER_ID) {
            continue;
        }
        return true;
    }
    false
}

fn has_recent_auto_welcome(app_id: &str, guest_identity: &str, within_ms: i64) -> bool {
    let key = guest_key(app_id, guest_identity);
    if let Some(ts) = WELCOME_TIMESTAMP_BY_GUEST.get(&key) {
        if chrono::Utc::now().timestamp_millis() - *ts <= within_ms {
            return true;
        }
    }
    false
}

fn cancel_welcome_task(app_id: &str, guest_identity: &str) {
    let key = guest_key(app_id, guest_identity);
    if let Some((_, handle)) = PENDING_WELCOME_TASKS.remove(&key) {
        handle.abort();
    }
}

fn cancel_no_reply_task(app_id: &str, guest_identity: &str) {
    let key = guest_key(app_id, guest_identity);
    if let Some((_, handle)) = PENDING_NO_REPLY_TASKS.remove(&key) {
        handle.abort();
    }
}

fn guest_key(app_id: &str, guest_identity: &str) -> String {
    format!("{}::{}", app_id.trim(), guest_identity.trim())
}

fn remember_guest_phone_identity(app_id: &str, guest_phone: Option<&str>, guest_identity: &str) {
    let Some(phone) = guest_phone.filter(|s| !s.is_empty()) else {
        return;
    };
    GUEST_IDENTITY_BY_APP_PHONE.insert(format!("{}::{}", app_id.trim(), phone.trim()), guest_identity.to_string());
}

fn resolve_canonical_guest_identity(
    app_id: &str,
    guest_session_id: Option<&str>,
    guest_phone: Option<&str>,
    socket_id: &str,
) -> String {
    if let Some(phone) = guest_phone.filter(|s| !s.is_empty()) {
        let key = format!("{}::{}", app_id.trim(), phone.trim());
        if let Some(mapped) = GUEST_IDENTITY_BY_APP_PHONE.get(&key) {
            return mapped.clone();
        }
    }

    if let Some(from_session) = SESSION_GUEST_IDENTITIES.get(socket_id) {
        return from_session.clone();
    }

    if let Some(gs) = guest_session_id.filter(|s| !s.is_empty() && !looks_like_phone(s)) {
        return gs.to_string();
    }

    format!("guest_{}", &socket_id[socket_id.len().saturating_sub(12)..])
}

fn looks_like_phone(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() >= 8 && trimmed.chars().all(|c| c.is_ascii_digit() || c == '+' || c == '-' || c == ' ')
}

fn parse_app_id_from_room(room: Option<&str>) -> Option<String> {
    let room = room?;
    let payload = room.split(':').nth(1)?;
    if payload.is_empty() {
        return None;
    }
    Some(payload.split(';').next()?.to_string())
}

fn get_str(obj: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = obj.get(*key).and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
            return Some(s.to_string());
        }
    }
    None
}

pub fn on_disconnect(socket_id: &str) {
    SESSION_APP_IDS.remove(socket_id);
    SESSION_USERNAMES.remove(socket_id);
    SESSION_GUEST_IDENTITIES.remove(socket_id);
    SESSION_GUEST_PHONES.remove(socket_id);
    SESSION_GUEST_LOCALES.remove(socket_id);
    SESSION_IS_ADMIN.remove(socket_id);
}
