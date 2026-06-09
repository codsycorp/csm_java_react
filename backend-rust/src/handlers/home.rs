use std::sync::Arc;

use serde_json::{json, Map, Value};

use crate::model::StandardResponse;
use crate::services::googlebot::GoogleBotVisitService;

pub struct HomeHandler {
    googlebot: GoogleBotVisitService,
}

impl HomeHandler {
    pub fn new(record_manager: Arc<crate::data::RecordManager>) -> Self {
        Self {
            googlebot: GoogleBotVisitService::new(record_manager),
        }
    }

    fn ok_result(result: Value) -> StandardResponse {
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("message", "ok");
        r.set("result", result);
        r
    }

    pub fn handle_home(&self) -> StandardResponse {
        Self::ok_result(json!({
            "totalVisits": 10000,
            "totalUsers": 432,
            "totalOrders": 218,
            "totalIncome": 98000000
        }))
    }

    pub fn handle_notifications(&self) -> StandardResponse {
        Self::ok_result(json!([{
            "id": "000000001",
            "title": "Chào mừng bạn đến với hệ thống",
            "datetime": "2025-04-15",
            "type": "notification"
        }]))
    }

    pub fn handle_home_pie(&self) -> StandardResponse {
        Self::ok_result(json!([
            { "name": "Loại A", "value": 45 },
            { "name": "Loại B", "value": 30 },
            { "name": "Loại C", "value": 25 }
        ]))
    }

    pub fn handle_home_line(&self, _params: &Map<String, Value>) -> StandardResponse {
        let data: Vec<Value> = (1..=12)
            .map(|i| {
                json!({
                    "month": format!("Tháng {i}"),
                    "value": (i * 73) % 1000
                })
            })
            .collect();
        Self::ok_result(Value::Array(data))
    }

    pub fn handle_googlebot_stats(&self, params: &Map<String, Value>) -> StandardResponse {
        let limit = parse_usize_param(params.get("limit")).unwrap_or(50);
        let offset = parse_usize_param(params.get("offset")).unwrap_or(0);
        let stats = self.googlebot.get_stats(limit, offset);
        Self::ok_result(Value::Object(stats))
    }

    pub fn handle_googlebot_delete(&self, params: &Map<String, Value>) -> StandardResponse {
        let delete_all = params
            .get("all")
            .or_else(|| params.get("deleteAll"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let ids = parse_id_list(params.get("ids"));
        let stats = self.googlebot.delete_visits(&ids, delete_all);
        Self::ok_result(Value::Object(stats))
    }
}

fn parse_usize_param(value: Option<&Value>) -> Option<usize> {
    value.and_then(|v| {
        v.as_u64()
            .map(|n| n as usize)
            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    })
}

fn parse_id_list(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .filter(|s| !s.is_empty())
            .collect(),
        Some(Value::String(s)) => s
            .split(',')
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .map(String::from)
            .collect(),
        _ => vec![],
    }
}
