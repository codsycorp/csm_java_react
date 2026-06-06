use std::sync::Arc;

use serde_json::Map;

use crate::data::RecordManager;
use crate::model::StandardResponse;

pub struct SeoHandler {
    record_manager: Arc<RecordManager>,
}

impl SeoHandler {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn handle_seo(&self, _params: &Map<String, serde_json::Value>) -> StandardResponse {
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("message", "SEO handler ready");
        r
    }
}
