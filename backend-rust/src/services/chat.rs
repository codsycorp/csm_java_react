use std::sync::Arc;

use serde_json::{Map, Value};

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
        let filter = SearchFilter::eq("room_id", room_id);
        self.record_manager
            .filter(app_id, &Self::chat_table(app_id), &filter)
    }

    pub fn save_message(&self, app_id: &str, message: Map<String, Value>) -> Result<(), String> {
        self.record_manager
            .create_record(app_id, &Self::chat_table(app_id), message, None)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}
