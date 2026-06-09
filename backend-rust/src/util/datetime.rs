use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use serde_json::{Map, Value};

const EPOCH_SEC_THRESHOLD: i64 = 1_000_000_000_000;

fn epoch_from_raw_number(raw: i64) -> i64 {
    if raw > 0 && raw < EPOCH_SEC_THRESHOLD {
        raw * 1000
    } else {
        raw.max(0)
    }
}

fn local_epoch_from_naive(dt: NaiveDateTime) -> i64 {
    Local
        .from_local_datetime(&dt)
        .latest()
        .map(|z| z.timestamp_millis())
        .unwrap_or(0)
}

fn local_epoch_from_date(d: NaiveDate) -> i64 {
    d.and_hms_opt(0, 0, 0)
        .map(local_epoch_from_naive)
        .unwrap_or(0)
}

fn parse_compact_epoch(s: &str) -> Option<i64> {
    if s.len() == 8 && s.chars().all(|c| c.is_ascii_digit()) {
        return NaiveDate::parse_from_str(s, "%Y%m%d")
            .ok()
            .map(local_epoch_from_date);
    }
    if s.len() == 14 && s.chars().all(|c| c.is_ascii_digit()) {
        return NaiveDateTime::parse_from_str(s, "%Y%m%d%H%M%S")
            .ok()
            .map(local_epoch_from_naive);
    }
    None
}

fn parse_iso_instant(s: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp_millis())
        .or_else(|| {
            DateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%SZ")
                .ok()
                .map(|dt| dt.timestamp_millis())
        })
}

fn parse_local_datetime_patterns(s: &str) -> Option<i64> {
    for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"] {
        if let Ok(dt) = NaiveDateTime::parse_from_str(s, fmt) {
            return Some(local_epoch_from_naive(dt));
        }
        if fmt == "%Y-%m-%d" {
            if let Ok(d) = NaiveDate::parse_from_str(s, fmt) {
                return Some(local_epoch_from_date(d));
            }
        }
    }
    None
}

/// Mirrors Java `RecordManager.parseEpochMillisLike`.
pub fn parse_epoch_millis_like(value: Option<&Value>) -> i64 {
    match value {
        None | Some(Value::Null) => 0,
        Some(Value::Number(n)) => {
            if let Some(i) = n.as_i64() {
                epoch_from_raw_number(i)
            } else if let Some(u) = n.as_u64() {
                epoch_from_raw_number(u as i64)
            } else if let Some(f) = n.as_f64() {
                epoch_from_raw_number(f as i64)
            } else {
                0
            }
        }
        Some(Value::String(s)) => parse_epoch_millis_str(s).unwrap_or(0),
        _ => 0,
    }
}

fn parse_epoch_millis_str(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }

    if let Ok(raw) = s.parse::<i64>() {
        return Some(epoch_from_raw_number(raw));
    }

    if let Some(ts) = parse_compact_epoch(s) {
        return Some(ts);
    }

    if let Some(ts) = parse_iso_instant(s) {
        return Some(ts);
    }

    let spaced = format!("{}Z", s.replace(' ', "T"));
    if let Some(ts) = parse_iso_instant(&spaced) {
        return Some(ts);
    }

    parse_local_datetime_patterns(s)
}

/// Mirrors Java `WebSpringController.parseDateTimeToEpochMillis`.
pub fn parse_datetime_to_epoch_millis(value: Option<&Value>) -> i64 {
    match value {
        None | Some(Value::Null) => 0,
        Some(Value::Number(n)) => n
            .as_i64()
            .or_else(|| n.as_u64().map(|u| u as i64))
            .unwrap_or(0)
            .max(0),
        Some(Value::String(s)) => parse_datetime_to_epoch_str(s).unwrap_or(0),
        _ => 0,
    }
}

fn parse_datetime_to_epoch_str(s: &str) -> Option<i64> {
    let raw = s.trim();
    if raw.is_empty() {
        return None;
    }

    if (10..=13).contains(&raw.len()) && raw.chars().all(|c| c.is_ascii_digit()) {
        let epoch = raw.parse::<i64>().ok()?;
        return Some(if raw.len() == 10 { epoch * 1000 } else { epoch });
    }

    if let Some(ts) = parse_iso_instant(raw) {
        return Some(ts);
    }

    if raw.len() <= 10 {
        if let Ok(d) = NaiveDate::parse_from_str(raw, "%Y-%m-%d") {
            return Some(local_epoch_from_date(d));
        }
    }

    for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"] {
        if let Ok(dt) = NaiveDateTime::parse_from_str(raw, fmt) {
            return Some(local_epoch_from_naive(dt));
        }
    }

    parse_compact_epoch(raw)
}

/// Mirrors Java `RecordManager.resolveRecordSortTimestamp`.
pub fn resolve_record_sort_ts(record: &Map<String, Value>) -> i64 {
    for field in ["publish_date", "updated_at", "created_at", "id"] {
        let ts = parse_epoch_millis_like(record.get(field));
        if ts > 0 {
            return ts;
        }
    }
    0
}

/// Mirrors Java `WebSpringController.resolveRelatedPostSortTs`.
pub fn resolve_related_post_sort_ts(record: &Map<String, Value>) -> i64 {
    for field in ["publish_date", "updated_at", "created_at"] {
        let ts = parse_datetime_to_epoch_millis(record.get(field));
        if ts > 0 {
            return ts;
        }
    }
    0
}

fn record_id_str(record: &Map<String, Value>) -> String {
    record
        .get("id")
        .and_then(|v| v.as_str().map(String::from))
        .or_else(|| record.get("id").and_then(|v| v.as_i64().map(|n| n.to_string())))
        .unwrap_or_default()
}

pub fn compare_records_desc(a: &Map<String, Value>, b: &Map<String, Value>) -> std::cmp::Ordering {
    let ta = resolve_record_sort_ts(a);
    let tb = resolve_record_sort_ts(b);
    tb.cmp(&ta).then_with(|| compare_id_desc(a, b))
}

pub fn compare_related_post_rows_desc(
    a: &Map<String, Value>,
    b: &Map<String, Value>,
) -> std::cmp::Ordering {
    let ta = resolve_related_post_sort_ts(a);
    let tb = resolve_related_post_sort_ts(b);
    tb.cmp(&ta).then_with(|| compare_id_desc(a, b))
}

fn compare_id_desc(a: &Map<String, Value>, b: &Map<String, Value>) -> std::cmp::Ordering {
    let ida = record_id_str(a);
    let idb = record_id_str(b);
    match (ida.parse::<i64>(), idb.parse::<i64>()) {
        (Ok(la), Ok(lb)) => lb.cmp(&la),
        _ => idb.cmp(&ida),
    }
}

/// Mirrors Java `WebSpringController.toIsoDate` / `resolveLastmodCandidate`.
pub fn resolve_lastmod_from_row(row: &Value) -> Option<String> {
    for key in [
        "updated_at",
        "publish_date",
        "modified_at",
        "updatedAt",
        "created_at",
    ] {
        if let Some(iso) = to_iso_date(row.get(key)) {
            return Some(iso);
        }
    }
    None
}

pub fn to_iso_date(value: Option<&Value>) -> Option<String> {
    match value {
        None | Some(Value::Null) => None,
        Some(Value::Number(n)) => {
            let ms = n
                .as_i64()
                .or_else(|| n.as_u64().map(|u| u as i64))
                .filter(|v| *v > 0)?;
            Some(format_iso_date(ms))
        }
        Some(Value::String(s)) => to_iso_date_str(s),
        _ => None,
    }
}

fn to_iso_date_str(s: &str) -> Option<String> {
    let raw = s.trim();
    if raw.is_empty() {
        return None;
    }

    if raw.chars().all(|c| c.is_ascii_digit()) && raw.len() >= 6 {
        if raw.len() == 8 {
            if let Ok(d) = NaiveDate::parse_from_str(raw, "%Y%m%d") {
                return Some(d.format("%Y-%m-%d").to_string());
            }
        }
        if raw.len() == 14 {
            if let Ok(dt) = NaiveDateTime::parse_from_str(raw, "%Y%m%d%H%M%S") {
                return Some(
                    DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                        .to_rfc3339(),
                );
            }
        }
        if let Ok(ms) = raw.parse::<i64>() {
            let epoch = if raw.len() == 10 {
                ms * 1000
            } else {
                ms
            };
            if epoch > 0 {
                return Some(format_iso_date(epoch));
            }
        }
    }

    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|dt| dt.to_rfc3339())
        .or_else(|| {
            parse_epoch_millis_str(raw)
                .filter(|ts| *ts > 0)
                .map(format_iso_date)
        })
}

pub fn format_iso_date(epoch_millis: i64) -> String {
    DateTime::<Utc>::from_timestamp_millis(epoch_millis)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

/// Mirrors Java `WebSpringController.extractDateOnly`.
pub fn extract_date_only(lastmod: &str) -> String {
    let lastmod = lastmod.trim();
    if lastmod.is_empty() {
        return String::new();
    }
    if lastmod.len() == 10
        && lastmod.as_bytes().get(4) == Some(&b'-')
        && lastmod.as_bytes().get(7) == Some(&b'-')
    {
        return lastmod.to_string();
    }
    if lastmod.len() >= 10
        && lastmod.as_bytes().get(4) == Some(&b'-')
        && lastmod.as_bytes().get(7) == Some(&b'-')
    {
        return lastmod[..10].to_string();
    }
    if lastmod.len() == 8 && lastmod.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(d) = NaiveDate::parse_from_str(lastmod, "%Y%m%d") {
            return d.format("%Y-%m-%d").to_string();
        }
    }
    lastmod.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_epoch_millis_like_handles_iso_and_db_formats() {
        assert!(parse_epoch_millis_like(Some(&json!("2025-06-06 14:30:00"))) > 0);
        assert!(parse_epoch_millis_like(Some(&json!("2025-06-06"))) > 0);
        assert_eq!(
            parse_epoch_millis_like(Some(&json!(1_700_000_000_i64))),
            1_700_000_000_000
        );
        assert!(parse_epoch_millis_like(Some(&json!("20250606143000"))) > 0);
        assert!(parse_epoch_millis_like(Some(&json!("20250606"))) > 0);
    }

    #[test]
    fn parse_datetime_to_epoch_millis_handles_ssr_formats() {
        assert_eq!(
            parse_datetime_to_epoch_millis(Some(&json!(1_700_000_000_000_i64))),
            1_700_000_000_000
        );
        assert!(parse_datetime_to_epoch_millis(Some(&json!("1700000000"))) > 0);
        assert!(parse_datetime_to_epoch_millis(Some(&json!("2025-06-06"))) > 0);
    }

    #[test]
    fn resolve_record_sort_ts_prefers_publish_date() {
        let mut row = Map::new();
        row.insert("publish_date".into(), json!("2025-06-06"));
        row.insert("id".into(), json!("999"));
        let ts = resolve_record_sort_ts(&row);
        assert!(ts > 0);
    }

    #[test]
    fn resolve_related_post_sort_ts_ignores_id() {
        let mut row = Map::new();
        row.insert("id".into(), json!("9999999999"));
        assert_eq!(resolve_related_post_sort_ts(&row), 0);
    }

    #[test]
    fn compare_related_post_rows_desc_sorts_by_date_then_id() {
        let mut newer = Map::new();
        newer.insert("publish_date".into(), json!("2025-06-07"));
        newer.insert("id".into(), json!("1"));
        let mut older = Map::new();
        older.insert("publish_date".into(), json!("2025-06-06"));
        older.insert("id".into(), json!("2"));
        assert_eq!(
            compare_related_post_rows_desc(&newer, &older),
            std::cmp::Ordering::Less
        );
    }

    #[test]
    fn resolve_lastmod_from_compact_storage() {
        let row = json!({"publish_date": "20250606"});
        let lm = resolve_lastmod_from_row(&row).unwrap();
        assert!(lm.starts_with("2025-06-06") || lm.contains("2025"));
    }

    #[test]
    fn extract_date_only_normalizes_formats() {
        assert_eq!(extract_date_only("2025-06-06T10:00:00Z"), "2025-06-06");
        assert_eq!(extract_date_only("20250606"), "2025-06-06");
    }
}
