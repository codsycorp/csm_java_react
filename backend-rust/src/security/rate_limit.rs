use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

#[derive(Clone)]
pub struct RateLimiter {
    max_requests: u32,
    window: Duration,
    trackers: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window_ms: u64) -> Self {
        Self {
            max_requests,
            window: Duration::from_millis(window_ms),
            trackers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn check(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut trackers = self.trackers.lock();
        let entries = trackers.entry(key.to_string()).or_default();
        entries.retain(|t| now.duration_since(*t) < self.window);
        if entries.len() as u32 >= self.max_requests {
            return false;
        }
        entries.push(now);
        true
    }
}
