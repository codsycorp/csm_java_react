use std::sync::Arc;

use serde_json::{json, Map, Value};

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse};

pub struct HomeHandler {
    record_manager: Arc<RecordManager>,
}

impl HomeHandler {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn handle_home(&self) -> StandardResponse {
        let users = self.record_manager.count_actual_records("csm", "csm_accounts");
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set(
            "result",
            json!({
                "users": users,
                "backend": "rust",
                "status": "UP",
            }),
        );
        r
    }

    pub fn handle_notifications(&self) -> StandardResponse {
        let filter = SearchFilter::eq("status", "unread");
        let page = self
            .record_manager
            .filter("csm", "csm_notifications", &filter);
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("result", page.get("data").cloned().unwrap_or(json!([])));
        r
    }

    pub fn handle_home_pie(&self) -> StandardResponse {
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set(
            "result",
            json!({
                "series": [
                    { "name": "Users", "value": self.record_manager.count_actual_records("csm", "csm_accounts") },
                    { "name": "CRM", "value": self.record_manager.count_actual_records("csm", "crm_customers") },
                ]
            }),
        );
        r
    }

    pub fn handle_home_line(&self, params: &Map<String, Value>) -> StandardResponse {
        let days = params.get("days").and_then(|v| v.as_u64()).unwrap_or(7);
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set(
            "result",
            json!({
                "labels": (0..days).map(|d| format!("D{d}")).collect::<Vec<_>>(),
                "values": vec![0; days as usize],
            }),
        );
        r
    }

    pub fn handle_googlebot_stats(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = params.get("app_id").and_then(|v| v.as_str()).unwrap_or("csm");
        let page = self
            .record_manager
            .filter(app_id, "crm_service_traffic_stats", &Default::default());
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("result", page.get("data").cloned().unwrap_or(json!([])));
        r
    }
}
