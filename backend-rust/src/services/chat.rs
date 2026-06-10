use std::sync::Arc;

use serde_json::{json, Map, Value};
use uuid::Uuid;

use crate::data::RecordManager;
use crate::model::SearchFilter;

pub struct ChatPersistenceService {
    record_manager: Arc<RecordManager>,
}

impl ChatPersistenceService {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn chat_table(app_id: &str) -> String {
        format!("{app_id}_chat_messages")
    }

    pub fn get_history(&self, app_id: &str, room_id: &str) -> Map<String, Value> {
        let filter = SearchFilter::eq("room", room_id);
        self.record_manager
            .filter(app_id, &Self::chat_table(app_id), &filter)
    }

    fn all_messages_for_app(&self, app_id: &str) -> Vec<Map<String, Value>> {
        let page = self
            .record_manager
            .filter(app_id, &Self::chat_table(app_id), &SearchFilter::default());
        page.get("data")
            .or_else(|| page.get("rows"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_object().cloned())
                    .collect()
            })
            .unwrap_or_default()
    }

    fn msg_app_id(msg: &Map<String, Value>) -> Option<&str> {
        msg.get("appId")
            .or_else(|| msg.get("app_id"))
            .and_then(|v| v.as_str())
    }

    fn msg_timestamp(msg: &Map<String, Value>) -> i64 {
        msg.get("timestamp")
            .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|n| n as i64)))
            .unwrap_or(0)
    }

    fn matches_guest(msg: &Map<String, Value>, guest_session_id: &str, guest_phone: Option<&str>) -> bool {
        let sid = msg
            .get("guestSessionId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let phone = msg.get("guestPhone").and_then(|v| v.as_str()).unwrap_or("");
        let to = msg.get("to").and_then(|v| v.as_str()).unwrap_or("");

        if !guest_session_id.is_empty()
            && (sid == guest_session_id || to == guest_session_id)
        {
            return true;
        }
        if let Some(gp) = guest_phone.filter(|s| !s.is_empty()) {
            if phone == gp || to == gp || sid == gp {
                return true;
            }
        }
        false
    }

    pub fn get_history_by_guest_identity(
        &self,
        app_id: &str,
        guest_session_id: Option<&str>,
        guest_phone: Option<&str>,
        limit: usize,
    ) -> Vec<Map<String, Value>> {
        let sid = guest_session_id.unwrap_or("").trim();
        let phone = guest_phone.unwrap_or("").trim();
        if sid.is_empty() && phone.is_empty() {
            return vec![];
        }

        let mut matched: Vec<Map<String, Value>> = self
            .all_messages_for_app(app_id)
            .into_iter()
            .filter(|msg| {
                Self::msg_app_id(msg).map(|a| a == app_id).unwrap_or(true)
                    && Self::matches_guest(msg, sid, Some(phone).filter(|s| !s.is_empty()))
            })
            .collect();

        matched.sort_by_key(|m| Self::msg_timestamp(m));
        if matched.len() > limit {
            matched.split_off(matched.len() - limit)
        } else {
            matched
        }
    }

    pub fn get_guest_sessions_by_app_id(&self, app_id: &str) -> Vec<String> {
        use std::collections::HashSet;
        let mut sessions = HashSet::new();
        for msg in self.all_messages_for_app(app_id) {
            if let Some(s) = msg.get("guestSessionId").and_then(|v| v.as_str()) {
                if !s.is_empty() {
                    sessions.insert(s.to_string());
                }
            }
            if let Some(p) = msg.get("guestPhone").and_then(|v| v.as_str()) {
                if !p.is_empty() {
                    sessions.insert(p.to_string());
                }
            }
        }
        let mut list: Vec<_> = sessions.into_iter().collect();
        list.sort();
        list
    }

    pub fn rebind_guest_phone(&self, app_id: &str, old_identity: &str, new_phone: &str) -> usize {
        if old_identity.is_empty() || new_phone.is_empty() {
            return 0;
        }
        let new_room = format!("guest:{app_id};{new_phone}");
        let mut updated = 0usize;

        for mut msg in self.all_messages_for_app(app_id) {
            let sid = msg
                .get("guestSessionId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let phone = msg.get("guestPhone").and_then(|v| v.as_str()).unwrap_or("");
            let to = msg.get("to").and_then(|v| v.as_str()).unwrap_or("").to_string();

            if old_identity != sid && old_identity != phone {
                continue;
            }

            msg.insert("guestPhone".into(), json!(new_phone));
            msg.insert("guestSessionId".into(), json!(new_phone));
            msg.insert("room".into(), json!(new_room));
            if old_identity == to {
                msg.insert("to".into(), json!(new_phone));
            }
            if !msg.contains_key("id") {
                msg.insert("id".into(), json!(Uuid::new_v4().to_string()));
            }

            if self
                .record_manager
                .create_record(app_id, &Self::chat_table(app_id), msg, None)
                .is_ok()
            {
                updated += 1;
            }
        }
        updated
    }

    pub fn save_message(&self, app_id: &str, mut message: Map<String, Value>) -> Result<(), String> {
        if !message.contains_key("id") {
            message.insert("id".into(), json!(Uuid::new_v4().to_string()));
        }
        if !message.contains_key("timestamp") {
            message.insert("timestamp".into(), json!(chrono::Utc::now().timestamp_millis()));
        }
        if !message.contains_key("appId") {
            message.insert("appId".into(), json!(app_id));
        }
        self.record_manager
            .create_record(app_id, &Self::chat_table(app_id), message, None)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}
