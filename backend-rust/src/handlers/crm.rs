use std::sync::Arc;

use serde_json::{json, Map, Value};

use crate::model::StandardResponse;
use crate::security::auth::AuthUser;
use crate::services::crm::CrmService;
use crate::services::crm_analytics::CrmAnalyticsService;
use crate::services::user::UserService;

pub struct CrmHandler {
    crm_service: Arc<CrmService>,
    analytics: Arc<CrmAnalyticsService>,
    #[allow(dead_code)]
    user_service: Arc<UserService>,
}

impl CrmHandler {
    pub fn new(
        crm_service: Arc<CrmService>,
        analytics: Arc<CrmAnalyticsService>,
        user_service: Arc<UserService>,
    ) -> Self {
        Self {
            crm_service,
            analytics,
            user_service,
        }
    }

    fn app_id(params: &Map<String, Value>, auth: Option<&AuthUser>) -> String {
        params
            .get("appId")
            .or_else(|| params.get("app_id"))
            .and_then(|v| v.as_str())
            .or_else(|| auth.map(|a| a.app_id.as_str()))
            .unwrap_or("csm")
            .to_string()
    }

    pub fn handle_create_or_update(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let data = self.crm_service.create_or_update_customer(&app_id, params.clone());
        let mut r = StandardResponse::new();
        let ok = data.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
        r.set("success", ok);
        if ok {
            r.set("data", data.get("customer").cloned().unwrap_or(Value::Null));
            r.set("message", "Customer saved successfully");
        } else {
            r.set("error", data.get("error").cloned().unwrap_or(Value::Null));
        }
        r
    }

    pub fn handle_customers(&self, params: &Map<String, Value>, auth: Option<&AuthUser>) -> StandardResponse {
        let app_id = Self::app_id(params, auth);
        let status = params.get("status").and_then(|v| v.as_str());
        let assigned = params.get("assignedTo").and_then(|v| v.as_str());
        let search = params.get("search").and_then(|v| v.as_str());
        let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(100) as usize;
        let offset = params.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let customers = self.crm_service.get_customers(&app_id, status, assigned, search, offset, limit);
        let mut r = StandardResponse::new();
        r.set("success", true);
        r.set("data", json!(customers));
        r.set("total", customers.len());
        r
    }

    pub fn handle_customer_detail(&self, params: &Map<String, Value>, auth: Option<&AuthUser>) -> StandardResponse {
        let app_id = Self::app_id(params, auth);
        let phone = params.get("phone").and_then(|v| v.as_str()).unwrap_or("");
        let mut r = StandardResponse::new();
        if let Some(customer) = self.crm_service.get_customer_by_phone(&app_id, phone) {
            r.set("success", true);
            r.set("data", Value::Object(customer));
        } else {
            r.set("success", false);
            r.set("error", "Customer not found");
        }
        r
    }

    pub fn handle_assign(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let phone = params.get("phone").and_then(|v| v.as_str()).unwrap_or("");
        let assigned = params.get("assignedTo").and_then(|v| v.as_str()).unwrap_or("");
        let result = self.crm_service.assign_customer(&app_id, phone, assigned);
        self.bool_result(result)
    }

    pub fn handle_status(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let phone = params.get("phone").and_then(|v| v.as_str()).unwrap_or("");
        let status = params.get("status").and_then(|v| v.as_str()).unwrap_or("");
        let notes = params.get("notes").and_then(|v| v.as_str()).unwrap_or("");
        let result = self.crm_service.update_customer_status(&app_id, phone, status, notes);
        self.bool_result(result)
    }

    pub fn handle_purchase(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let phone = params.get("phone").and_then(|v| v.as_str()).unwrap_or("");
        let mut purchase = Map::new();
        for k in ["productId", "productName", "price", "advisorId"] {
            if let Some(v) = params.get(k) {
                purchase.insert(k.to_string(), v.clone());
            }
        }
        let result = self.crm_service.add_customer_purchase(&app_id, phone, purchase);
        self.bool_result(result)
    }

    pub fn handle_contact(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let phone = params.get("phone").and_then(|v| v.as_str()).unwrap_or("");
        let staff = params.get("staffId").and_then(|v| v.as_str()).unwrap_or("");
        let ctype = params.get("contactType").and_then(|v| v.as_str()).unwrap_or("message");
        let notes = params.get("notes").and_then(|v| v.as_str()).unwrap_or("");
        let result = self.crm_service.add_contact_history(&app_id, phone, ctype, notes, staff);
        self.bool_result(result)
    }

    pub fn handle_birthdays(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let days = params.get("days").and_then(|v| v.as_i64()).unwrap_or(7) as i32;
        let customers = self.crm_service.get_upcoming_birthdays(&app_id, days);
        let mut r = StandardResponse::new();
        r.set("success", true);
        r.set("data", json!(customers));
        r.set("total", customers.len());
        r
    }

    pub fn handle_crm_stats(&self, params: &Map<String, Value>, auth: Option<&AuthUser>) -> StandardResponse {
        let app_id = Self::app_id(params, auth);
        let from = params.get("fromDate").and_then(|v| v.as_str());
        let to = params.get("toDate").and_then(|v| v.as_str());
        let mut r = StandardResponse::new();
        r.set("success", true);
        r.set("data", Value::Object(self.crm_service.get_crm_stats(&app_id, from, to)));
        r
    }

    pub fn handle_website_stats(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let from = params.get("fromDate").and_then(|v| v.as_str());
        let to = params.get("toDate").and_then(|v| v.as_str());
        let mut r = StandardResponse::new();
        r.set("success", true);
        r.set("data", Value::Object(self.crm_service.get_website_stats(&app_id, from, to)));
        r
    }

    pub fn handle_ads_stats(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let from = params.get("fromDate").and_then(|v| v.as_str());
        let to = params.get("toDate").and_then(|v| v.as_str());
        let mut r = StandardResponse::new();
        r.set("success", true);
        r.set("data", Value::Object(self.crm_service.get_ads_stats(&app_id, from, to)));
        r
    }

    pub fn handle_create_ad(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let ad_data = params
            .get("adData")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_else(|| params.clone());
        let data = self.crm_service.create_ad(&app_id, ad_data);
        let mut r = StandardResponse::new();
        r.set("success", true);
        r.set("data", Value::Object(data));
        r.set("message", "Ad created successfully");
        r
    }

    pub fn handle_get_ads(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let platform = params.get("platform").and_then(|v| v.as_str());
        let status = params.get("status").and_then(|v| v.as_str());
        let ads = self.crm_service.get_ads(&app_id, status, platform);
        let mut r = StandardResponse::new();
        r.set("success", true);
        r.set("data", json!(ads));
        r.set("total", ads.len());
        r
    }

    pub fn handle_analytics(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let period = params.get("timePeriod").and_then(|v| v.as_str()).unwrap_or("week");
        let mut r = StandardResponse::new();
        r.set("success", true);
        r.set("data", Value::Object(self.analytics.get_analytics(&app_id, period)));
        r
    }

    pub fn handle_insights(&self, params: &Map<String, Value>) -> StandardResponse {
        let app_id = Self::app_id(params, None);
        let period = params.get("timePeriod").and_then(|v| v.as_str()).unwrap_or("week");
        let mut r = StandardResponse::new();
        r.set("success", true);
        r.set("data", Value::Object(self.analytics.get_ai_insights(&app_id, period)));
        r
    }

    fn bool_result(&self, result: Map<String, Value>) -> StandardResponse {
        let mut r = StandardResponse::new();
        let ok = result.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
        r.set("success", ok);
        if !ok {
            r.set("error", result.get("error").cloned().unwrap_or(Value::Null));
        }
        r
    }
}
