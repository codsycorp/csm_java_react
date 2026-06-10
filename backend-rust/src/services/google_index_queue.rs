use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tracing::{info, warn};

const QUEUE_FILE: &str = "google-index-queue.json";
const HISTORY_FILE: &str = "google-index-history.json";
const MAX_RETRY_COUNT: i32 = 3;
const DEDUP_DAYS: i64 = 30;
const MAX_HISTORY_ENTRIES_PER_URL: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlSubmissionQueue {
    pub url: String,
    pub action: String,
    #[serde(default = "default_priority")]
    pub priority: i32,
    #[serde(default = "now_ms")]
    pub queued_at: i64,
    #[serde(default)]
    pub retry_count: i32,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub last_attempt_at: i64,
}

fn default_priority() -> i32 {
    5
}
fn default_status() -> String {
    "PENDING".into()
}
fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

impl UrlSubmissionQueue {
    pub fn new(url: impl Into<String>, action: impl Into<String>, priority: i32) -> Self {
        Self {
            url: url.into(),
            action: action.into(),
            priority: priority.clamp(1, 10),
            queued_at: now_ms(),
            retry_count: 0,
            last_error: None,
            status: "PENDING".into(),
            last_attempt_at: 0,
        }
    }

    pub fn effective_priority(&self) -> f64 {
        let age_hours = (now_ms() - self.queued_at) as f64 / (1000.0 * 60.0 * 60.0);
        (11 - self.priority) as f64 * 100.0 + age_hours
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlSubmissionHistory {
    pub url: String,
    pub action: String,
    #[serde(default = "now_ms")]
    pub submitted_at: i64,
    #[serde(default)]
    pub submitted_date: String,
    pub success: bool,
    #[serde(default)]
    pub response: Option<String>,
    #[serde(default)]
    pub quota_used: i32,
    #[serde(default = "gen_submission_id")]
    pub submission_id: String,
}

fn gen_submission_id() -> String {
    format!("{}-{}", now_ms(), std::time::SystemTime::now().elapsed().unwrap_or_default().as_nanos())
}

impl UrlSubmissionHistory {
    pub fn new(url: impl Into<String>, action: impl Into<String>, success: bool) -> Self {
        let ts = now_ms();
        Self {
            url: url.into(),
            action: action.into(),
            submitted_at: ts,
            submitted_date: chrono::Local::now().format("%Y-%m-%d").to_string(),
            success,
            response: None,
            quota_used: 0,
            submission_id: gen_submission_id(),
        }
    }

    pub fn is_within_days(&self, days: i64) -> bool {
        now_ms() - self.submitted_at < days * 24 * 60 * 60 * 1000
    }
}

pub struct GoogleIndexQueueService {
    queue_file: PathBuf,
    history_file: PathBuf,
    inner: Mutex<QueueInner>,
}

struct QueueInner {
    queue: HashMap<String, UrlSubmissionQueue>,
    history: HashMap<String, Vec<UrlSubmissionHistory>>,
}

impl GoogleIndexQueueService {
    pub fn new(work_dir: PathBuf) -> Self {
        let svc = Self {
            queue_file: work_dir.join(QUEUE_FILE),
            history_file: work_dir.join(HISTORY_FILE),
            inner: Mutex::new(QueueInner {
                queue: HashMap::new(),
                history: HashMap::new(),
            }),
        };
        svc.load_queue();
        svc.load_history();
        let (q, h) = {
            let g = svc.inner.lock().unwrap();
            (g.queue.len(), g.history.len())
        };
        info!("GoogleIndexQueueService initialized — queue: {q}, history URLs: {h}");
        svc
    }

    pub fn add_to_queue(&self, url: &str, action: &str, priority: i32) -> bool {
        let mut g = self.inner.lock().unwrap();
        if g.queue.contains_key(url) {
            return false;
        }
        if Self::is_recently_submitted_inner(&g.history, url, DEDUP_DAYS) {
            return false;
        }
        g.queue.insert(url.to_string(), UrlSubmissionQueue::new(url, action, priority));
        drop(g);
        self.save_queue();
        true
    }

    pub fn add_batch_to_queue(&self, urls: &[String], action: &str, priority: i32) -> HashMap<String, bool> {
        urls.iter()
            .map(|u| (u.clone(), self.add_to_queue(u, action, priority)))
            .collect()
    }

    pub fn get_next_batch(&self, batch_size: usize) -> Vec<UrlSubmissionQueue> {
        let g = self.inner.lock().unwrap();
        let mut items: Vec<_> = g
            .queue
            .values()
            .filter(|i| i.status == "PENDING" || i.status == "FAILED")
            .filter(|i| i.retry_count < MAX_RETRY_COUNT)
            .cloned()
            .collect();
        items.sort_by(|a, b| b.effective_priority().partial_cmp(&a.effective_priority()).unwrap());
        items.truncate(batch_size);
        items
    }

    pub fn mark_as_processing(&self, url: &str) {
        let mut g = self.inner.lock().unwrap();
        if let Some(item) = g.queue.get_mut(url) {
            item.status = "PROCESSING".into();
            item.last_attempt_at = now_ms();
        }
        drop(g);
        self.save_queue();
    }

    pub fn mark_as_completed(&self, url: &str, success: bool, response: &str) {
        let mut g = self.inner.lock().unwrap();
        let Some(mut item) = g.queue.remove(url) else {
            return;
        };

        if success {
            let mut hist = UrlSubmissionHistory::new(&item.url, &item.action, true);
            hist.response = Some(response.to_string());
            g.history.entry(item.url.clone()).or_default().push(hist);
            Self::trim_history(&mut g.history, &item.url);
            drop(g);
            self.save_queue();
            self.save_history();
            return;
        }

        item.retry_count += 1;
        item.last_error = Some(response.to_string());
        if item.retry_count >= MAX_RETRY_COUNT {
            let mut hist = UrlSubmissionHistory::new(&item.url, &item.action, false);
            hist.response = Some(response.to_string());
            g.history.entry(item.url.clone()).or_default().push(hist);
            Self::trim_history(&mut g.history, &item.url);
        } else {
            item.status = "PENDING".into();
            g.queue.insert(url.to_string(), item);
        }
        drop(g);
        self.save_queue();
        self.save_history();
    }

    pub fn remove_from_queue(&self, url: &str) -> bool {
        let removed = self.inner.lock().unwrap().queue.remove(url).is_some();
        if removed {
            self.save_queue();
        }
        removed
    }

    pub fn get_queue_info(&self) -> Map<String, Value> {
        let g = self.inner.lock().unwrap();
        let pending = g.queue.values().filter(|i| i.status == "PENDING").count();
        let processing = g.queue.values().filter(|i| i.status == "PROCESSING").count();
        let failed = g.queue.values().filter(|i| i.status == "FAILED").count();
        let mut m = Map::new();
        m.insert("total".into(), json!(g.queue.len()));
        m.insert("pending".into(), json!(pending));
        m.insert("processing".into(), json!(processing));
        m.insert("failed".into(), json!(failed));
        m.insert("history_urls".into(), json!(g.history.len()));
        m
    }

    pub fn get_queue_items(&self, page: usize, page_size: usize) -> Vec<UrlSubmissionQueue> {
        let g = self.inner.lock().unwrap();
        let mut items: Vec<_> = g.queue.values().cloned().collect();
        items.sort_by(|a, b| b.effective_priority().partial_cmp(&a.effective_priority()).unwrap());
        items.into_iter().skip(page * page_size).take(page_size).collect()
    }

    pub fn get_history(&self, url: &str) -> Vec<UrlSubmissionHistory> {
        self.inner
            .lock()
            .unwrap()
            .history
            .get(url)
            .cloned()
            .unwrap_or_default()
    }

    pub fn get_recent_history(&self, limit: usize) -> Vec<UrlSubmissionHistory> {
        let g = self.inner.lock().unwrap();
        let mut all: Vec<_> = g.history.values().flatten().cloned().collect();
        all.sort_by(|a, b| b.submitted_at.cmp(&a.submitted_at));
        all.truncate(limit);
        all
    }

    fn is_recently_submitted_inner(history: &HashMap<String, Vec<UrlSubmissionHistory>>, url: &str, days: i64) -> bool {
        history
            .get(url)
            .map(|h| h.iter().any(|e| e.success && e.is_within_days(days)))
            .unwrap_or(false)
    }

    fn trim_history(history: &mut HashMap<String, Vec<UrlSubmissionHistory>>, url: &str) {
        if let Some(list) = history.get_mut(url) {
            if list.len() > MAX_HISTORY_ENTRIES_PER_URL {
                list.sort_by(|a, b| b.submitted_at.cmp(&a.submitted_at));
                list.truncate(MAX_HISTORY_ENTRIES_PER_URL);
            }
        }
    }

    fn load_queue(&self) {
        let Ok(text) = fs::read_to_string(&self.queue_file) else {
            return;
        };
        if text.trim().is_empty() {
            return;
        }
        if let Ok(list) = serde_json::from_str::<Vec<UrlSubmissionQueue>>(&text) {
            let mut g = self.inner.lock().unwrap();
            g.queue.clear();
            for item in list {
                g.queue.insert(item.url.clone(), item);
            }
        }
    }

    fn load_history(&self) {
        let Ok(text) = fs::read_to_string(&self.history_file) else {
            return;
        };
        if text.trim().is_empty() {
            return;
        }
        if let Ok(map) = serde_json::from_str::<HashMap<String, Vec<UrlSubmissionHistory>>>(&text) {
            self.inner.lock().unwrap().history = map;
        }
    }

    fn save_queue(&self) {
        let g = self.inner.lock().unwrap();
        let list: Vec<_> = g.queue.values().cloned().collect();
        drop(g);
        if let Ok(json) = serde_json::to_string_pretty(&list) {
            if let Some(parent) = self.queue_file.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if let Err(e) = fs::write(&self.queue_file, json) {
                warn!("Failed to save google index queue: {e}");
            }
        }
    }

    fn save_history(&self) {
        let g = self.inner.lock().unwrap();
        let map = g.history.clone();
        drop(g);
        if let Ok(json) = serde_json::to_string_pretty(&map) {
            if let Some(parent) = self.history_file.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if let Err(e) = fs::write(&self.history_file, json) {
                warn!("Failed to save google index history: {e}");
            }
        }
    }
}
