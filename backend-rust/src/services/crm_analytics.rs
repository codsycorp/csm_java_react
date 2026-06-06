use std::sync::Arc;

use serde_json::{json, Map, Value};

use crate::services::crm::CrmService;

pub struct CrmAnalyticsService {
    crm: Arc<CrmService>,
}

impl CrmAnalyticsService {
    pub fn new(crm: Arc<CrmService>) -> Self {
        Self { crm }
    }

    pub fn get_analytics(&self, app_id: &str, time_period: &str) -> Map<String, Value> {
        let stats = self.crm.get_crm_stats(app_id, None, None);
        let mut out = Map::new();
        out.insert("timePeriod".into(), Value::String(time_period.into()));
        out.insert("metrics".into(), Value::Object(stats));
        out.insert("channels".into(), json!([]));
        out
    }

    pub fn get_ai_insights(&self, app_id: &str, time_period: &str) -> Map<String, Value> {
        let mut out = Map::new();
        out.insert("timePeriod".into(), Value::String(time_period.into()));
        out.insert(
            "analysis".into(),
            Value::String(format!("CRM insights for {app_id} ({time_period}) — connect AI local model for full analysis")),
        );
        out.insert("recommendations".into(), json!([]));
        out
    }
}
