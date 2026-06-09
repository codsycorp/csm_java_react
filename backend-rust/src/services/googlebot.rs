use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};

use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::{json, Map, Value};

use crate::data::RecordManager;
use crate::model::SearchFilter;

const APP_ID: &str = "csm";
const TABLE: &str = "googlebot_visits";
const PAGE_SIZE: usize = 500;

pub struct GoogleBotVisitService {
    record_manager: Arc<RecordManager>,
}

impl GoogleBotVisitService {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn get_stats(&self, limit: usize, offset: usize) -> Map<String, Value> {
        self.ensure_table();
        let capped_limit = limit.clamp(1, 200);
        let capped_offset = offset;
        let top_window_size = (capped_offset + capped_limit).max(1);

        let mut top_window = BinaryHeap::new();
        let mut daily: HashMap<String, Map<String, Value>> = HashMap::new();
        let mut total_visits = 0usize;

        let mut cursor: Option<String> = None;
        let mut seen_cursors = HashSet::new();

        loop {
            let page = self.record_manager.filter_with_pagination(
                APP_ID,
                TABLE,
                &SearchFilter::default(),
                cursor.as_deref(),
                None,
                PAGE_SIZE,
            );
            let rows = extract_rows(&page);
            if rows.is_empty() {
                break;
            }

            for raw_row in rows {
                let row = normalize_row(&raw_row);
                let id = row.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
                if id.is_empty() {
                    continue;
                }

                total_visits += 1;
                let ts = row.get("ts").and_then(|v| v.as_i64()).unwrap_or(0);

                if let Some(date_key) = row.get("dateKey").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                    let summary = daily.entry(date_key.to_string()).or_insert_with(|| {
                        let mut item = Map::new();
                        item.insert("date".into(), Value::String(date_key.to_string()));
                        item.insert("count".into(), json!(0));
                        item.insert(
                            "lastVisitAt".into(),
                            row.get("visitedAt").cloned().unwrap_or(Value::Null),
                        );
                        item.insert("lastTs".into(), json!(ts));
                        item
                    });
                    let count = summary
                        .get("count")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0)
                        + 1;
                    summary.insert("count".into(), json!(count));
                    let current_last_ts = summary
                        .get("lastTs")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
                    if ts > current_last_ts {
                        summary.insert("lastTs".into(), json!(ts));
                        summary.insert(
                            "lastVisitAt".into(),
                            row.get("visitedAt").cloned().unwrap_or(Value::Null),
                        );
                    }
                }

                if top_window.len() < top_window_size {
                    top_window.push(TsRow { ts, row });
                } else if let Some(min) = top_window.peek() {
                    if ts > min.ts {
                        top_window.pop();
                        top_window.push(TsRow { ts, row });
                    }
                }
            }

            cursor = next_cursor(&page, &mut seen_cursors);
            if cursor.is_none() {
                break;
            }
        }

        let mut latest_pool: Vec<Map<String, Value>> =
            top_window.into_iter().map(|item| item.row).collect();
        latest_pool.sort_by(|a, b| {
            let ta = a.get("ts").and_then(|v| v.as_i64()).unwrap_or(0);
            let tb = b.get("ts").and_then(|v| v.as_i64()).unwrap_or(0);
            tb.cmp(&ta)
        });

        let latest: Vec<Value> = latest_pool
            .into_iter()
            .skip(capped_offset)
            .take(capped_limit)
            .map(Value::Object)
            .collect();

        let mut by_date: Vec<Value> = daily
            .into_values()
            .map(|mut summary| {
                summary.remove("lastTs");
                Value::Object(summary)
            })
            .collect();
        by_date.sort_by(|a, b| {
            let da = a.get("date").and_then(|v| v.as_str()).unwrap_or("");
            let db = b.get("date").and_then(|v| v.as_str()).unwrap_or("");
            db.cmp(da)
        });

        let mut result = Map::new();
        result.insert("totalVisits".into(), json!(total_visits));
        result.insert("latest".into(), Value::Array(latest));
        result.insert("byDate".into(), Value::Array(by_date));
        result
    }

    pub fn delete_visits(&self, ids: &[String], delete_all: bool) -> Map<String, Value> {
        self.ensure_table();
        let mut deleted = 0usize;

        if delete_all {
            loop {
                let page = self.record_manager.filter_with_pagination(
                    APP_ID,
                    TABLE,
                    &SearchFilter::default(),
                    None,
                    None,
                    PAGE_SIZE,
                );
                let rows = extract_rows(&page);
                if rows.is_empty() {
                    break;
                }
                let mut deleted_in_batch = 0usize;
                for row in rows {
                    let Some(id) = row.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else {
                        continue;
                    };
                    if self
                        .record_manager
                        .delete_record(APP_ID, TABLE, &row)
                        .is_ok()
                    {
                        deleted += 1;
                        deleted_in_batch += 1;
                    }
                }
                if deleted_in_batch == 0 {
                    break;
                }
            }
        } else {
            for id in ids {
                if id.trim().is_empty() {
                    continue;
                }
                let mut row = Map::new();
                row.insert("id".into(), Value::String(id.trim().to_string()));
                if self
                    .record_manager
                    .delete_record(APP_ID, TABLE, &row)
                    .is_ok()
                {
                    deleted += 1;
                }
            }
        }

        let mut stats = self.get_stats(50, 0);
        stats.insert("deleted".into(), json!(deleted));
        stats
    }

    fn ensure_table(&self) {
        let filter = SearchFilter::eq("id", TABLE);
        let existing = self.record_manager.find(APP_ID, "index", &filter);
        if existing.is_empty() {
            let mut record = Map::new();
            record.insert("id".into(), Value::String(TABLE.into()));
            record.insert(
                "struct".into(),
                json!({
                    "fieldsPK": ["id"],
                    "fieldsSearch": ["host", "path", "dateKey", "ip", "userAgent"]
                }),
            );
            let _ = self.record_manager.create_record(APP_ID, "index", record, None);
        }
    }
}

#[derive(Eq)]
struct TsRow {
    ts: i64,
    row: Map<String, Value>,
}

impl PartialEq for TsRow {
    fn eq(&self, other: &Self) -> bool {
        self.ts == other.ts
    }
}

impl Ord for TsRow {
    fn cmp(&self, other: &Self) -> Ordering {
        self.ts.cmp(&other.ts)
    }
}

impl PartialOrd for TsRow {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn extract_rows(page: &Map<String, Value>) -> Vec<Map<String, Value>> {
    page.get("rows")
        .or_else(|| page.get("data"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_object().cloned())
                .collect()
        })
        .unwrap_or_default()
}

fn next_cursor(page: &Map<String, Value>, seen: &mut HashSet<String>) -> Option<String> {
    let cursor = page
        .get("nextCursor")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())?;
    if !seen.insert(cursor.to_string()) {
        return None;
    }
    Some(cursor.to_string())
}

fn normalize_row(input: &Map<String, Value>) -> Map<String, Value> {
    let mut row = Map::new();
    row.insert(
        "id".into(),
        Value::String(
            input
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        ),
    );
    for key in ["host", "path", "ip", "userAgent", "dateKey"] {
        row.insert(
            key.into(),
            Value::String(
                input
                    .get(key)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            ),
        );
    }

    let ts = input
        .get("ts")
        .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|n| n as i64)))
        .unwrap_or_else(|| {
            input
                .get("visitedAt")
                .and_then(|v| v.as_str())
                .and_then(parse_instant)
                .unwrap_or(0)
        });
    row.insert("ts".into(), json!(ts));

    let visited_at = input
        .get("visitedAt")
        .and_then(|v| v.as_str())
        .map(String::from)
        .or_else(|| {
            if ts > 0 {
                DateTime::<Utc>::from_timestamp_millis(ts).map(|dt| dt.to_rfc3339())
            } else {
                None
            }
        });
    row.insert(
        "visitedAt".into(),
        visited_at.map(Value::String).unwrap_or(Value::Null),
    );
    row
}

fn parse_instant(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.timestamp_millis())
        .or_else(|| {
            value
                .parse::<i64>()
                .ok()
                .or_else(|| value.parse::<f64>().ok().map(|n| n as i64))
        })
}
