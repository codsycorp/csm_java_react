use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tracing::{info, warn};

use super::google_index_queue::GoogleIndexQueueService;

const INDEXING_API_URL: &str = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SEARCH_CONSOLE_SITES_URL: &str = "https://www.googleapis.com/webmasters/v3/sites";
const URL_INSPECTION_URL: &str = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const SCOPE_INDEXING: &str = "https://www.googleapis.com/auth/indexing";
const SCOPE_WEBMASTERS: &str = "https://www.googleapis.com/auth/webmasters";
const QUOTA_STATE_FILE: &str = "google-index-quota-state.json";
const MAX_RETRIES: usize = 3;
const RETRY_DELAY_MS: u64 = 1000;
const DELAY_BETWEEN_REQUESTS_MS: u64 = 500;

#[derive(Debug, Clone)]
pub struct IndexingResult {
    pub success: bool,
    pub message: String,
    pub response_body: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SearchConsoleResult {
    pub is_indexed: bool,
    pub verdict: String,
    pub details: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct QuotaState {
    date: String,
    used: i32,
    limit: i32,
    #[serde(default)]
    last_updated: i64,
}

#[derive(Serialize)]
struct ServiceAccountClaims {
    iss: String,
    sub: String,
    aud: String,
    iat: i64,
    exp: i64,
    scope: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    expires_in: i64,
}

struct CachedToken {
    token: String,
    expires_at: SystemTime,
}

pub struct GoogleIndexService {
    http: Client,
    service_account_path: PathBuf,
    daily_limit: i32,
    work_dir: PathBuf,
    queue: GoogleIndexQueueService,
    service_account: Mutex<Option<Value>>,
    quota: Mutex<HashMap<String, QuotaState>>,
    indexing_token: Mutex<Option<CachedToken>>,
    search_console_token: Mutex<Option<CachedToken>>,
}

impl GoogleIndexService {
    pub fn new(http: Client, work_dir: PathBuf) -> Self {
        let service_account_path = std::env::var("GOOGLE_INDEX_SERVICE_ACCOUNT_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./index-google-service-account.json"));
        let daily_limit = std::env::var("GOOGLE_INDEX_DAILY_LIMIT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(200);

        let svc = Self {
            http,
            service_account_path,
            daily_limit,
            work_dir: work_dir.clone(),
            queue: GoogleIndexQueueService::new(work_dir),
            service_account: Mutex::new(None),
            quota: Mutex::new(HashMap::new()),
            indexing_token: Mutex::new(None),
            search_console_token: Mutex::new(None),
        };
        svc.load_service_account();
        svc.load_quota_state();
        svc
    }

    pub fn queue_service(&self) -> &GoogleIndexQueueService {
        &self.queue
    }

    pub async fn handle_operation(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let operation = params
            .get("operation")
            .and_then(|v| v.as_str())
            .unwrap_or("submit")
            .to_lowercase();

        match operation.as_str() {
            "submit" => self.op_submit(params).await,
            "check" => self.op_check(params).await,
            "check-auto" => self.op_check_auto(params).await,
            "quota" => self.op_quota(),
            "sites" => self.op_sites().await,
            "add-to-queue" => self.op_add_to_queue(params),
            "add-batch-to-queue" => self.op_add_batch(params),
            "queue-info" => self.op_queue_info(),
            "queue-items" => self.op_queue_items(params),
            "process-queue" => self.op_process_queue(params).await,
            "remove-from-queue" => self.op_remove_from_queue(params),
            "history" => self.op_history(params),
            "recent-history" => self.op_recent_history(params),
            _ => {
                let mut r = Map::new();
                r.insert("code".into(), json!(400));
                r.insert("success".into(), json!(false));
                r.insert("message".into(), json!(format!("Invalid operation: {operation}")));
                r
            }
        }
    }

    fn ok(data: Value, message: impl Into<String>) -> Map<String, Value> {
        let mut r = Map::new();
        r.insert("code".into(), json!(200));
        r.insert("success".into(), json!(true));
        r.insert("data".into(), data);
        r.insert("message".into(), json!(message.into()));
        r
    }

    fn err(code: u16, message: impl Into<String>) -> Map<String, Value> {
        let mut r = Map::new();
        r.insert("code".into(), json!(code));
        r.insert("success".into(), json!(false));
        r.insert("message".into(), json!(message.into()));
        r
    }

    async fn op_submit(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let urls = collect_urls(params);
        if urls.is_empty() {
            return Self::err(400, "Missing 'url' or 'urls' parameter");
        }
        if !self.check_quota_available(urls.len() as i32) {
            let mut r = Self::err(429, "Quota exceeded");
            r.insert("data".into(), json!(self.get_quota_info()));
            return r;
        }

        let action = params.get("action").and_then(|v| v.as_str()).unwrap_or("publish");
        let mut results = Vec::new();
        let mut success_count = 0;
        let mut failure_count = 0;

        for (i, url) in urls.iter().enumerate() {
            let result = self.submit_url_to_google(url, action).await;
            if result.success {
                success_count += 1;
            } else {
                failure_count += 1;
            }
            results.push(json!({
                "url": url,
                "success": result.success,
                "message": result.message,
                "response": result.response_body,
            }));
            if i + 1 < urls.len() {
                tokio::time::sleep(Duration::from_millis(DELAY_BETWEEN_REQUESTS_MS)).await;
            }
        }

        let mut summary = Map::new();
        summary.insert("total_submitted".into(), json!(urls.len()));
        summary.insert("success_count".into(), json!(success_count));
        summary.insert("failure_count".into(), json!(failure_count));
        summary.insert("quota".into(), json!(self.get_quota_info()));
        summary.insert("results".into(), json!(results));

        let mut r = Self::ok(Value::Object(summary), format!("{success_count} URLs submitted successfully"));
        r.insert("success".into(), json!(success_count > 0));
        r
    }

    async fn op_check(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let Some(url) = params.get("url").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else {
            return Self::err(400, "Missing 'url' parameter");
        };
        let result = self.check_indexing_status(url).await;
        let mut data = Map::new();
        data.insert("url".into(), json!(url));
        data.insert("indexed".into(), json!(result.is_indexed));
        data.insert("verdict".into(), json!(result.verdict));
        if let Some(d) = result.details {
            data.insert("details".into(), d);
        }
        Self::ok(Value::Object(data), format!("Indexing status: {}", result.verdict))
    }

    async fn op_check_auto(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let Some(url) = params.get("url").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else {
            return Self::err(400, "Missing 'url' parameter");
        };
        let check = self.check_indexing_status(url).await;
        let mut data = Map::new();
        data.insert("url".into(), json!(url));
        data.insert("checkStatus".into(), json!({
            "isIndexed": check.is_indexed,
            "verdict": check.verdict,
            "details": check.details,
        }));
        data.insert("publishResult".into(), Value::Null);
        data.insert("autoPublished".into(), json!(false));

        let mut message = format!("Verdict: {}", check.verdict);
        if check.verdict.eq_ignore_ascii_case("NEUTRAL") {
            let publish = self.submit_url_to_google(url, "publish").await;
            data.insert("publishResult".into(), json!({
                "success": publish.success,
                "message": publish.message,
                "responseBody": publish.response_body,
            }));
            data.insert("autoPublished".into(), json!(true));
            message = if publish.success {
                "URL chưa indexed, đã tự động gửi publish request".into()
            } else {
                format!("Kiểm tra thành công nhưng publish thất bại: {}", publish.message)
            };
        } else if check.verdict.eq_ignore_ascii_case("PASS") {
            message = "✅ URL đã được indexed".into();
        }

        data.insert("message".into(), json!(message));
        Self::ok(Value::Object(data), message)
    }

    fn op_quota(&self) -> Map<String, Value> {
        Self::ok(json!(self.get_quota_info()), "Quota information retrieved")
    }

    async fn op_sites(&self) -> Map<String, Value> {
        match self.get_site_list().await {
            Ok(sites) => {
                let n = sites.len();
                Self::ok(json!(sites), format!("Retrieved {n} sites"))
            }
            Err(e) => Self::err(500, format!("Error: {e}")),
        }
    }

    fn op_add_to_queue(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let Some(url) = params.get("url").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else {
            return Self::err(400, "Missing 'url' parameter");
        };
        let action = params.get("action").and_then(|v| v.as_str()).unwrap_or("publish");
        let priority = params.get("priority").and_then(|v| v.as_i64()).unwrap_or(5) as i32;
        let added = self.queue.add_to_queue(url, action, priority);
        let msg = if added {
            "Added to queue"
        } else {
            "Already in queue or recently submitted"
        };
        let mut data = Map::new();
        data.insert("url".into(), json!(url));
        data.insert("added".into(), json!(added));
        data.insert("message".into(), json!(msg));
        data.insert("queue_info".into(), json!(self.queue.get_queue_info()));
        let mut r = Self::ok(Value::Object(data), msg);
        r.insert("success".into(), json!(added));
        r
    }

    fn op_add_batch(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let Some(urls_val) = params.get("urls") else {
            return Self::err(400, "Missing 'urls' parameter");
        };
        let urls: Vec<String> = match urls_val {
            Value::Array(arr) => arr.iter().filter_map(|v| v.as_str().map(str::to_string)).collect(),
            Value::String(s) if !s.is_empty() => vec![s.clone()],
            _ => vec![],
        };
        if urls.is_empty() {
            return Self::err(400, "URLs list is empty");
        }
        let action = params.get("action").and_then(|v| v.as_str()).unwrap_or("publish");
        let priority = params.get("priority").and_then(|v| v.as_i64()).unwrap_or(5) as i32;
        let results = self.queue.add_batch_to_queue(&urls, action, priority);
        let added = results.values().filter(|&&v| v).count();
        let skipped = results.len() - added;
        let mut data = Map::new();
        data.insert("total".into(), json!(urls.len()));
        data.insert("added".into(), json!(added));
        data.insert("skipped".into(), json!(skipped));
        data.insert("results".into(), json!(results));
        data.insert("queue_info".into(), json!(self.queue.get_queue_info()));
        Self::ok(
            Value::Object(data),
            format!("Added {added}/{} URLs to queue", urls.len()),
        )
    }

    fn op_queue_info(&self) -> Map<String, Value> {
        let mut data = Map::new();
        data.insert("queue".into(), json!(self.queue.get_queue_info()));
        data.insert("quota".into(), json!(self.get_quota_info()));
        Self::ok(Value::Object(data), "Queue info retrieved")
    }

    fn op_queue_items(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let page = params.get("page").and_then(|v| v.as_i64()).unwrap_or(0).max(0) as usize;
        let page_size = params.get("pageSize").and_then(|v| v.as_i64()).unwrap_or(20).max(1) as usize;
        let items = self.queue.get_queue_items(page, page_size);
        let mut data = Map::new();
        data.insert("items".into(), json!(items));
        data.insert("page".into(), json!(page));
        data.insert("pageSize".into(), json!(page_size));
        data.insert("totalInQueue".into(), self.queue.get_queue_info().get("total").cloned().unwrap_or(json!(0)));
        Self::ok(Value::Object(data), format!("Retrieved {} queue items", items.len()))
    }

    async fn op_process_queue(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let batch_size = params.get("batchSize").and_then(|v| v.as_i64()).unwrap_or(10).max(1) as usize;
        let summary = self.process_batch_from_queue(batch_size).await;
        Self::ok(json!(summary), "Queue processing completed")
    }

    fn op_remove_from_queue(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let Some(url) = params.get("url").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else {
            return Self::err(400, "Missing 'url' parameter");
        };
        let removed = self.queue.remove_from_queue(url);
        let msg = if removed {
            "Removed from queue"
        } else {
            "URL not found in queue"
        };
        let mut data = Map::new();
        data.insert("url".into(), json!(url));
        data.insert("removed".into(), json!(removed));
        let mut r = Self::ok(Value::Object(data), msg);
        r.insert("success".into(), json!(removed));
        r
    }

    fn op_history(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let Some(url) = params.get("url").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else {
            return Self::err(400, "Missing 'url' parameter");
        };
        let history = self.queue.get_history(url);
        let count = history.len();
        let mut data = Map::new();
        data.insert("url".into(), json!(url));
        data.insert("history".into(), json!(history));
        data.insert("count".into(), json!(count));
        Self::ok(Value::Object(data), format!("Retrieved {count} history entries"))
    }

    fn op_recent_history(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let limit = params.get("limit").and_then(|v| v.as_i64()).unwrap_or(50).max(1) as usize;
        let history = self.queue.get_recent_history(limit);
        let mut data = Map::new();
        data.insert("history".into(), json!(history));
        data.insert("count".into(), json!(history.len()));
        Self::ok(Value::Object(data), format!("Retrieved {} recent history entries", history.len()))
    }

    pub async fn submit_url_to_google(&self, url: &str, action: &str) -> IndexingResult {
        if !self.reserve_quota(1) {
            return IndexingResult {
                success: false,
                message: "Quota exceeded".into(),
                response_body: None,
            };
        }

        for attempt in 0..MAX_RETRIES {
            match self.get_access_token(SCOPE_INDEXING).await {
                Ok(token) => match self.send_indexing_request(url, action, &token).await {
                    Ok(body) => {
                        info!("URL indexed successfully — {url}");
                        return IndexingResult {
                            success: true,
                            message: "Submitted successfully".into(),
                            response_body: Some(body),
                        };
                    }
                    Err(e) => {
                        if attempt + 1 < MAX_RETRIES {
                            tokio::time::sleep(Duration::from_millis(RETRY_DELAY_MS * 2u64.pow(attempt as u32))).await;
                        } else {
                            return IndexingResult {
                                success: false,
                                message: e.clone(),
                                response_body: Some(e),
                            };
                        }
                    }
                },
                Err(e) => {
                    return IndexingResult {
                        success: false,
                        message: e,
                        response_body: None,
                    };
                }
            }
        }
        IndexingResult {
            success: false,
            message: "Failed after retries".into(),
            response_body: None,
        }
    }

    pub async fn process_batch_from_queue(&self, batch_size: usize) -> Map<String, Value> {
        let available = self.get_remaining_daily_quota();
        if available <= 0 {
            let mut r = Map::new();
            r.insert("success".into(), json!(false));
            r.insert("message".into(), json!("No quota remaining"));
            r.insert("processed".into(), json!(0));
            return r;
        }

        let effective = batch_size.min(available as usize);
        let batch = self.queue.get_next_batch(effective);
        if batch.is_empty() {
            let mut r = Map::new();
            r.insert("success".into(), json!(true));
            r.insert("message".into(), json!("Queue is empty"));
            r.insert("processed".into(), json!(0));
            return r;
        }

        let mut success_count = 0;
        let mut fail_count = 0;
        let mut results = Vec::new();

        for item in &batch {
            self.queue.mark_as_processing(&item.url);
            let result = self.submit_url_to_google(&item.url, &item.action).await;
            self.queue
                .mark_as_completed(&item.url, result.success, &result.message);
            if result.success {
                success_count += 1;
            } else {
                fail_count += 1;
            }
            results.push(json!({
                "url": item.url,
                "success": result.success,
                "message": result.message,
            }));
            tokio::time::sleep(Duration::from_millis(DELAY_BETWEEN_REQUESTS_MS)).await;
        }

        let mut summary = Map::new();
        summary.insert("success".into(), json!(true));
        summary.insert("processed".into(), json!(batch.len()));
        summary.insert("success_count".into(), json!(success_count));
        summary.insert("fail_count".into(), json!(fail_count));
        summary.insert("remaining_quota".into(), json!(self.get_remaining_daily_quota()));
        summary.insert("queue_info".into(), json!(self.queue.get_queue_info()));
        summary.insert("results".into(), json!(results));
        summary
    }

    pub async fn check_indexing_status(&self, url: &str) -> SearchConsoleResult {
        let token = match self.get_access_token(SCOPE_WEBMASTERS).await {
            Ok(t) => t,
            Err(e) => {
                warn!("Search Console token error: {e}");
                return SearchConsoleResult {
                    is_indexed: false,
                    verdict: "EXCEPTION".into(),
                    details: None,
                };
            }
        };

        let site_url = derive_site_url(url);
        let body = json!({
            "inspectionUrl": url,
            "siteUrl": site_url,
        });

        let resp = match self
            .http
            .post(URL_INSPECTION_URL)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                warn!("URL Inspection request failed: {e}");
                return SearchConsoleResult {
                    is_indexed: false,
                    verdict: "ERROR".into(),
                    details: None,
                };
            }
        };

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            warn!("URL Inspection HTTP {status}: {text}");
            return SearchConsoleResult {
                is_indexed: false,
                verdict: "ERROR".into(),
                details: None,
            };
        }

        let parsed: Value = serde_json::from_str(&text).unwrap_or(json!({}));
        let inspection = parsed.get("inspectionResult");
        let index_status = inspection.and_then(|v| v.get("indexStatusResult"));
        let verdict = index_status
            .and_then(|v| v.get("verdict"))
            .and_then(|v| v.as_str())
            .unwrap_or("UNKNOWN")
            .to_string();
        let is_indexed = verdict.eq_ignore_ascii_case("PASS");
        SearchConsoleResult {
            is_indexed,
            verdict,
            details: index_status.cloned(),
        }
    }

    pub async fn get_site_list(&self) -> Result<Vec<Value>, String> {
        let token = self.get_access_token(SCOPE_WEBMASTERS).await?;
        let resp = self
            .http
            .get(SEARCH_CONSOLE_SITES_URL)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let text = resp.text().await.map_err(|e| e.to_string())?;
        let parsed: Value = serde_json::from_str(&text).unwrap_or(json!({}));
        Ok(parsed
            .get("siteEntry")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default())
    }

    pub fn get_quota_info(&self) -> Map<String, Value> {
        let state = self.get_today_quota_state();
        let remaining = self.get_remaining_daily_quota();
        let mut m = Map::new();
        m.insert("daily_limit".into(), json!(state.limit));
        m.insert("used_today".into(), json!(state.used));
        m.insert("remaining".into(), json!(remaining));
        m.insert("last_reset_date".into(), json!(state.date));
        let pct = if state.limit > 0 {
            (state.used * 100) / state.limit
        } else {
            0
        };
        m.insert("usage_percentage".into(), json!(pct));
        m
    }

    fn check_quota_available(&self, requested: i32) -> bool {
        self.get_remaining_daily_quota() >= requested
    }

    fn get_remaining_daily_quota(&self) -> i32 {
        let state = self.get_today_quota_state();
        (state.limit - state.used).max(0)
    }

    fn reserve_quota(&self, count: i32) -> bool {
        let today = today_date_string();
        let mut quota = self.quota.lock().unwrap();
        let state = quota.entry(today.clone()).or_insert_with(|| QuotaState {
            date: today,
            used: 0,
            limit: self.daily_limit,
            last_updated: now_ms(),
        });
        if state.used + count > state.limit {
            return false;
        }
        state.used += count;
        state.last_updated = now_ms();
        drop(quota);
        self.save_quota_state();
        true
    }

    fn get_today_quota_state(&self) -> QuotaState {
        self.check_and_reset_daily_quota();
        let today = today_date_string();
        self.quota
            .lock()
            .unwrap()
            .get(&today)
            .cloned()
            .unwrap_or_else(|| QuotaState {
                date: today,
                used: 0,
                limit: self.daily_limit,
                last_updated: now_ms(),
            })
    }

    fn check_and_reset_daily_quota(&self) {
        let today = today_date_string();
        let mut quota = self.quota.lock().unwrap();
        if !quota.contains_key(&today) {
            quota.retain(|date, _| {
                chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
                    .map(|d| d >= chrono::Local::now().date_naive() - chrono::Duration::days(7))
                    .unwrap_or(false)
            });
            quota.insert(
                today.clone(),
                QuotaState {
                    date: today,
                    used: 0,
                    limit: self.daily_limit,
                    last_updated: now_ms(),
                },
            );
            drop(quota);
            self.save_quota_state();
        }
    }

    async fn send_indexing_request(&self, url: &str, action: &str, access_token: &str) -> Result<String, String> {
        let notif_type = if action.eq_ignore_ascii_case("remove") {
            "URL_REMOVED"
        } else {
            "URL_UPDATED"
        };
        let body = json!({ "url": url, "type": notif_type });
        let resp = self
            .http
            .post(INDEXING_API_URL)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if status.is_success() {
            Ok(text)
        } else {
            if status.as_u16() == 429 {
                self.sync_quota_from_error(&text);
            }
            Err(format!("HTTP {}: {}", status, text))
        }
    }

    fn sync_quota_from_error(&self, error_response: &str) {
        let Ok(parsed) = serde_json::from_str::<Value>(error_response) else {
            return;
        };
        let Some(error) = parsed.get("error") else { return };
        if error.get("code").and_then(|v| v.as_i64()) != Some(429) {
            return;
        }
        let today = today_date_string();
        let mut quota = self.quota.lock().unwrap();
        if let Some(state) = quota.get_mut(&today) {
            state.used = state.limit;
            state.last_updated = now_ms();
        }
        drop(quota);
        self.save_quota_state();
    }

    async fn get_access_token(&self, scope: &str) -> Result<String, String> {
        let cache = if scope == SCOPE_INDEXING {
            &self.indexing_token
        } else {
            &self.search_console_token
        };
        {
            let guard = cache.lock().unwrap();
            if let Some(c) = guard.as_ref() {
                if c.expires_at > SystemTime::now() + Duration::from_secs(60) {
                    return Ok(c.token.clone());
                }
            }
        }

        let sa = self.load_service_account();
        let client_email = sa
            .get("client_email")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing client_email in service account".to_string())?;
        let private_key = sa
            .get("private_key")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing private_key in service account".to_string())?;

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs() as i64;
        let claims = ServiceAccountClaims {
            iss: client_email.to_string(),
            sub: client_email.to_string(),
            aud: TOKEN_URL.to_string(),
            iat: now,
            exp: now + 3600,
            scope: scope.to_string(),
        };

        let key = EncodingKey::from_rsa_pem(private_key.as_bytes()).map_err(|e| e.to_string())?;
        let jwt = encode(
            &Header::new(Algorithm::RS256),
            &claims,
            &key,
        )
        .map_err(|e| e.to_string())?;

        let resp = self
            .http
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                ("assertion", &jwt),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(format!("Token exchange failed HTTP {status}: {text}"));
        }

        let token_resp: TokenResponse = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let expires_at = SystemTime::now() + Duration::from_secs(token_resp.expires_in.max(300) as u64);
        *cache.lock().unwrap() = Some(CachedToken {
            token: token_resp.access_token.clone(),
            expires_at,
        });
        Ok(token_resp.access_token)
    }

    fn load_service_account(&self) -> Value {
        let mut guard = self.service_account.lock().unwrap();
        if guard.is_some() {
            return guard.clone().unwrap();
        }
        let path = &self.service_account_path;
        if !path.exists() {
            warn!("Google service account not found at {}", path.display());
            return json!({});
        }
        match fs::read_to_string(path) {
            Ok(text) => {
                let val: Value = serde_json::from_str(&text).unwrap_or(json!({}));
                if val.get("client_email").is_some() {
                    info!("Loaded Google service account from {}", path.display());
                }
                *guard = Some(val.clone());
                val
            }
            Err(e) => {
                warn!("Failed to read service account: {e}");
                json!({})
            }
        }
    }

    fn load_quota_state(&self) {
        let path = self.work_dir.join(QUOTA_STATE_FILE);
        let Ok(text) = fs::read_to_string(&path) else {
            return;
        };
        if let Ok(state) = serde_json::from_str::<QuotaState>(&text) {
            let today = today_date_string();
            if state.date == today {
                self.quota.lock().unwrap().insert(today, state);
            }
        }
    }

    fn save_quota_state(&self) {
        let today = today_date_string();
        let state = self.quota.lock().unwrap().get(&today).cloned();
        if let Some(state) = state {
            let path = self.work_dir.join(QUOTA_STATE_FILE);
            if let Ok(json) = serde_json::to_string_pretty(&state) {
                if let Some(parent) = path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::write(path, json);
            }
        }
    }
}

fn collect_urls(params: &Map<String, Value>) -> Vec<String> {
    if let Some(url) = params.get("url").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        return vec![url.to_string()];
    }
    if let Some(urls) = params.get("urls") {
        match urls {
            Value::Array(arr) => return arr.iter().filter_map(|v| v.as_str().map(str::to_string)).collect(),
            Value::String(s) if !s.is_empty() => return vec![s.clone()],
            _ => {}
        }
    }
    vec![]
}

fn derive_site_url(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|host| format!("{}://{}/", u.scheme(), host)))
        .unwrap_or_else(|| "https://www.phanmemmottrieu.net/".into())
}

fn today_date_string() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
