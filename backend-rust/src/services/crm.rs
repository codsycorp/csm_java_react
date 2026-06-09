use std::sync::Arc;

use chrono::Utc;
use serde_json::{json, Map, Value};
use tracing::info;
use uuid::Uuid;

use crate::data::RecordManager;
use crate::model::SearchFilter;

const TABLE_CUSTOMERS: &str = "crm_customers";
const TABLE_PURCHASES: &str = "crm_purchases";
const TABLE_CONTACT_HISTORY: &str = "crm_contact_history";
const TABLE_ADS: &str = "crm_ads";

pub struct CrmService {
    record_manager: Arc<RecordManager>,
}

impl CrmService {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn initialize_tables(&self) {
        let _ = self.ensure_table(TABLE_CUSTOMERS, vec!["phone", "app_id"], vec!["phone", "name", "status"]);
        let _ = self.ensure_table(TABLE_PURCHASES, vec!["purchase_id"], vec!["purchase_id", "customer_phone"]);
        let _ = self.ensure_table(TABLE_CONTACT_HISTORY, vec!["history_id"], vec!["history_id", "customer_phone"]);
        let _ = self.ensure_table(TABLE_ADS, vec!["ad_id"], vec!["ad_id", "platform", "status"]);
        info!("CRM tables initialized");
    }

    fn ensure_table(&self, name: &str, pk: Vec<&str>, search: Vec<&str>) -> Result<(), String> {
        let filter = SearchFilter::eq("id", name);
        let existing = self.record_manager.find("csm", "index", &filter);
        if existing.is_empty() {
            let mut record = Map::new();
            record.insert("id".into(), Value::String(name.into()));
            record.insert(
                "struct".into(),
                json!({
                    "fieldsPK": pk,
                    "fieldsSearch": search
                }),
            );
            self.record_manager
                .create_record("csm", "index", record, None)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn create_or_update_customer(
        &self,
        app_id: &str,
        customer_data: Map<String, Value>,
    ) -> Map<String, Value> {
        let phone = customer_data
            .get("phone")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if phone.is_empty() {
            return map_err("Phone number is required");
        }

        let mut data = customer_data;
        data.insert("app_id".into(), Value::String(app_id.into()));
        data.insert("phone".into(), Value::String(phone.clone()));
        if !data.contains_key("id") {
            data.insert("id".into(), Value::String(Uuid::new_v4().to_string()));
        }
        let now = Utc::now().timestamp_millis();
        if !data.contains_key("created_at") {
            data.insert("created_at".into(), json!(now));
        }
        data.insert("updated_at".into(), json!(now));

        match self.record_manager.create_record(app_id, TABLE_CUSTOMERS, data.clone(), Some(vec!["phone".into()])) {
            Ok(_) => {
                let mut r = Map::new();
                r.insert("success".into(), Value::Bool(true));
                r.insert("customer".into(), Value::Object(data));
                r
            }
            Err(e) => map_err(&e.to_string()),
        }
    }

    pub fn get_customers(
        &self,
        app_id: &str,
        status: Option<&str>,
        _assigned_to: Option<&str>,
        search: Option<&str>,
        offset: usize,
        limit: usize,
    ) -> Vec<Map<String, Value>> {
        let mut filter = SearchFilter::default();
        if let Some(s) = status {
            filter = SearchFilter::eq("status", s);
        }
        let page = self.record_manager.filter_with_pagination(
            app_id, TABLE_CUSTOMERS, &filter, None, Some(offset), limit,
        );
        let mut rows = extract_rows(&page);
        if let Some(q) = search {
            let q = q.to_lowercase();
            rows.retain(|r| {
                r.get("phone").and_then(|v| v.as_str()).unwrap_or("").contains(&q)
                    || r.get("name").and_then(|v| v.as_str()).unwrap_or("").to_lowercase().contains(&q)
            });
        }
        rows
    }

    pub fn get_customer_by_phone(&self, app_id: &str, phone: &str) -> Option<Map<String, Value>> {
        let filter = SearchFilter::eq("phone", phone);
        let r = self.record_manager.find(app_id, TABLE_CUSTOMERS, &filter);
        if r.is_empty() { None } else { Some(r) }
    }

    pub fn assign_customer(&self, app_id: &str, phone: &str, employee_id: &str) -> Map<String, Value> {
        if let Some(mut customer) = self.get_customer_by_phone(app_id, phone) {
            customer.insert("assigned_to".into(), Value::String(employee_id.into()));
            customer.insert("updated_at".into(), json!(Utc::now().timestamp_millis()));
            let _ = self.record_manager.create_record(app_id, TABLE_CUSTOMERS, customer, Some(vec!["phone".into()]));
            return map_ok();
        }
        map_err("Customer not found")
    }

    pub fn update_customer_status(&self, app_id: &str, phone: &str, status: &str, notes: &str) -> Map<String, Value> {
        if let Some(mut customer) = self.get_customer_by_phone(app_id, phone) {
            customer.insert("status".into(), Value::String(status.into()));
            if !notes.is_empty() {
                customer.insert("notes".into(), Value::String(notes.into()));
            }
            customer.insert("updated_at".into(), json!(Utc::now().timestamp_millis()));
            let _ = self.record_manager.create_record(app_id, TABLE_CUSTOMERS, customer, Some(vec!["phone".into()]));
            return map_ok();
        }
        map_err("Customer not found")
    }

    pub fn add_customer_purchase(&self, app_id: &str, phone: &str, purchase: Map<String, Value>) -> Map<String, Value> {
        let purchase_id = Uuid::new_v4().to_string();
        let mut data = purchase;
        data.insert("id".into(), Value::String(Uuid::new_v4().to_string()));
        data.insert("purchase_id".into(), Value::String(purchase_id));
        data.insert("app_id".into(), Value::String(app_id.into()));
        data.insert("customer_phone".into(), Value::String(phone.into()));
        data.insert("created_at".into(), json!(Utc::now().timestamp_millis()));
        match self.record_manager.create_record(app_id, TABLE_PURCHASES, data.clone(), Some(vec!["purchase_id".into()])) {
            Ok(_) => {
                let mut r = Map::new();
                r.insert("success".into(), Value::Bool(true));
                r.insert("purchase".into(), Value::Object(data));
                r
            }
            Err(e) => map_err(&e.to_string()),
        }
    }

    pub fn add_contact_history(
        &self,
        app_id: &str,
        phone: &str,
        contact_type: &str,
        notes: &str,
        employee_id: &str,
    ) -> Map<String, Value> {
        let history_id = Uuid::new_v4().to_string();
        let mut data = Map::new();
        data.insert("id".into(), Value::String(Uuid::new_v4().to_string()));
        data.insert("history_id".into(), Value::String(history_id));
        data.insert("app_id".into(), Value::String(app_id.into()));
        data.insert("customer_phone".into(), Value::String(phone.into()));
        data.insert("contact_type".into(), Value::String(contact_type.into()));
        data.insert("notes".into(), Value::String(notes.into()));
        data.insert("employee_id".into(), Value::String(employee_id.into()));
        data.insert("created_at".into(), json!(Utc::now().timestamp_millis()));
        match self.record_manager.create_record(app_id, TABLE_CONTACT_HISTORY, data.clone(), Some(vec!["history_id".into()])) {
            Ok(_) => {
                let mut r = Map::new();
                r.insert("success".into(), Value::Bool(true));
                r.insert("history".into(), Value::Object(data));
                r
            }
            Err(e) => map_err(&e.to_string()),
        }
    }

    pub fn get_upcoming_birthdays(&self, app_id: &str, _days: i32) -> Vec<Map<String, Value>> {
        let page = self.record_manager.filter(app_id, TABLE_CUSTOMERS, &SearchFilter::default());
        extract_rows(&page)
    }

    pub fn get_crm_stats(&self, app_id: &str, _from: Option<&str>, _to: Option<&str>) -> Map<String, Value> {
        let rows = self.get_customers(app_id, None, None, None, 0, 5000);
        let purchases = extract_rows(
            &self
                .record_manager
                .filter(app_id, TABLE_PURCHASES, &SearchFilter::default()),
        );
        let mut by_status = Map::new();
        let mut by_source = Map::new();
        let mut contacted_customers = 0usize;
        let mut converted_customers = 0usize;

        for r in &rows {
            let status = r
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("new")
                .to_ascii_lowercase();
            let count = by_status
                .get(&status)
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
                + 1;
            by_status.insert(status.clone(), json!(count));

            if matches!(status.as_str(), "contacted" | "follow_up" | "purchased") {
                contacted_customers += 1;
            }
            if status == "purchased" {
                converted_customers += 1;
            }

            let source = r
                .get("source")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("unknown")
                .to_string();
            let source_count = by_source
                .get(&source)
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
                + 1;
            by_source.insert(source, json!(source_count));
        }

        let mut total_revenue = 0.0f64;
        let total_purchases = purchases.len();
        for purchase in &purchases {
            total_revenue += purchase
                .get("price")
                .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                .unwrap_or(0.0);
        }

        let total_customers = rows.len();
        let mut stats = Map::new();
        stats.insert("total_customers".into(), json!(total_customers));
        stats.insert("new_customers".into(), json!(total_customers));
        stats.insert("contacted_customers".into(), json!(contacted_customers));
        stats.insert("converted_customers".into(), json!(converted_customers));
        stats.insert("total_purchases".into(), json!(total_purchases));
        stats.insert("total_revenue".into(), json!(total_revenue));
        stats.insert("by_status".into(), Value::Object(by_status));
        stats.insert("by_source".into(), Value::Object(by_source));
        stats.insert("conversion_rate".into(), json!(
            if contacted_customers > 0 {
                converted_customers as f64 / contacted_customers as f64
            } else {
                0.0
            }
        ));
        stats
    }

    pub fn get_website_stats(&self, _app_id: &str, _from: Option<&str>, _to: Option<&str>) -> Map<String, Value> {
        Map::new()
    }

    pub fn get_ads_stats(&self, _app_id: &str, _from: Option<&str>, _to: Option<&str>) -> Map<String, Value> {
        Map::new()
    }

    pub fn create_ad(&self, app_id: &str, ad_data: Map<String, Value>) -> Map<String, Value> {
        let ad_id = Uuid::new_v4().to_string();
        let mut data = ad_data;
        data.insert("ad_id".into(), Value::String(ad_id));
        data.insert("id".into(), Value::String(Uuid::new_v4().to_string()));
        data.insert("created_at".into(), json!(Utc::now().timestamp_millis()));
        let _ = self.record_manager.create_record(app_id, TABLE_ADS, data.clone(), Some(vec!["ad_id".into()]));
        data
    }

    pub fn get_ads(&self, app_id: &str, _status: Option<&str>, _platform: Option<&str>) -> Vec<Map<String, Value>> {
        extract_rows(&self.record_manager.filter(app_id, TABLE_ADS, &SearchFilter::default()))
    }
}

fn extract_rows(page: &Map<String, Value>) -> Vec<Map<String, Value>> {
    page.get("data")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_object().cloned())
                .collect()
        })
        .unwrap_or_default()
}

fn map_err(msg: &str) -> Map<String, Value> {
    let mut r = Map::new();
    r.insert("success".into(), Value::Bool(false));
    r.insert("error".into(), Value::String(msg.into()));
    r
}

fn map_ok() -> Map<String, Value> {
    let mut r = Map::new();
    r.insert("success".into(), Value::Bool(true));
    r
}
