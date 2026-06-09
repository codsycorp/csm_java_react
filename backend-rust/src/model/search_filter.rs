use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilter {
    #[serde(default = "default_and")]
    pub operator: String,
    #[serde(default)]
    pub conditions: Vec<SearchFilter>,
    #[serde(default)]
    pub field: String,
    #[serde(default)]
    #[serde(rename = "type")]
    pub filter_type: String,
    #[serde(default)]
    pub value: Value,
}

fn default_and() -> String {
    "AND".to_string()
}

impl SearchFilter {
    pub fn eq(field: impl Into<String>, value: impl Into<Value>) -> Self {
        Self {
            operator: "AND".into(),
            field: field.into(),
            filter_type: "eq".into(),
            value: value.into(),
            ..Default::default()
        }
    }

    pub fn matches(record: &serde_json::Map<String, Value>, filter: &SearchFilter) -> bool {
        if !filter.conditions.is_empty() {
            if filter.operator.eq_ignore_ascii_case("OR") {
                return filter
                    .conditions
                    .iter()
                    .any(|c| Self::matches(record, c));
            }
            return filter
                .conditions
                .iter()
                .all(|c| Self::matches(record, c));
        }

        if filter.field.is_empty() || filter.filter_type.is_empty() {
            return true;
        }

        let actual = record.get(&filter.field);
        match actual {
            // field absent: treat as null for isnotnull/isnull, false for everything else
            None => match filter.filter_type.as_str() {
                "isnull" | "isNull" => true,
                "isnotnull" | "notNull" => false,
                _ => false,
            },
            Some(actual) => Self::evaluate_condition(actual, &filter.filter_type, &filter.value),
        }
    }

    fn evaluate_condition(actual: &Value, op: &str, expected: &Value) -> bool {
        match op {
            "eq" => {
                if actual == expected {
                    return true;
                }
                // Coerce number ↔ string (DB may store run=1 as integer or "1" as string)
                let as_f64 = |v: &Value| {
                    v.as_f64()
                        .or_else(|| v.as_str().and_then(|s| s.trim().parse::<f64>().ok()))
                };
                if let (Some(a), Some(e)) = (as_f64(actual), as_f64(expected)) {
                    return (a - e).abs() < f64::EPSILON;
                }
                false
            }
            "eqIgnoreCase" => {
                if let (Some(a), Some(e)) = (actual.as_str(), expected.as_str()) {
                    a.trim().eq_ignore_ascii_case(e.trim())
                } else {
                    false
                }
            }
            "ne" => actual != expected,
            "gt" => compare_values(actual, expected) > 0,
            "gte" => compare_values(actual, expected) >= 0,
            "lt" => compare_values(actual, expected) < 0,
            "lte" => compare_values(actual, expected) <= 0,
            "in" => expected
                .as_array()
                .map(|arr| arr.contains(actual))
                .unwrap_or(false),
            "notIn" => expected
                .as_array()
                .map(|arr| !arr.contains(actual))
                .unwrap_or(true),
            "like" => {
                if let Some(e) = expected.as_str() {
                    if e.is_empty() {
                        return true;
                    }
                    if let Some(a) = value_as_compare_str(actual) {
                        return a.to_lowercase().contains(&e.to_lowercase());
                    }
                }
                false
            }
            "prefix" => {
                if let (Some(a), Some(e)) = (actual.as_str(), expected.as_str()) {
                    a.to_lowercase().starts_with(&e.to_lowercase())
                } else {
                    false
                }
            }
            "regex" => {
                if let (Some(a), Some(e)) = (actual.as_str(), expected.as_str()) {
                    regex::Regex::new(e)
                        .map(|re| re.is_match(a))
                        .unwrap_or(false)
                } else {
                    false
                }
            }
            "range" => {
                if let Some(arr) = expected.as_array() {
                    if arr.len() == 2 {
                        return compare_values(actual, &arr[0]) >= 0
                            && compare_values(actual, &arr[1]) <= 0;
                    }
                }
                false
            }
            "isnotnull" | "notNull" => !matches!(actual, Value::Null),
            "isnull" | "isNull" => matches!(actual, Value::Null),
            // noteq: not equal, also handles string vs number like "1" vs 1
            "noteq" | "notEq" => {
                if actual == expected {
                    return false;
                }
                // also treat empty string as matching null for noteq
                if matches!(actual, Value::Null) {
                    return expected.as_str().map(|s| !s.is_empty()).unwrap_or(true);
                }
                true
            }
            _ => false,
        }
    }
}

fn compare_values(a: &Value, b: &Value) -> i32 {
    if let (Some(aa), Some(bb)) = (compare_as_number(a), compare_as_number(b)) {
        return aa
            .partial_cmp(&bb)
            .unwrap_or(std::cmp::Ordering::Equal) as i32;
    }
    if let (Some(aa), Some(bb)) = (a.as_str(), b.as_str()) {
        return aa.cmp(bb) as i32;
    }
    0
}

fn compare_as_number(v: &Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_i64().map(|n| n as f64))
        .or_else(|| v.as_u64().map(|n| n as f64))
        .or_else(|| {
            v.as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .and_then(|s| s.parse::<f64>().ok())
        })
}

fn value_as_compare_str(v: &Value) -> Option<String> {
    v.as_str().map(String::from).or_else(|| {
        v.as_i64()
            .map(|n| n.to_string())
            .or_else(|| v.as_u64().map(|n| n.to_string()))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn compare_values_coerces_yyyymmdd_number_and_string() {
        assert!(compare_values(&json!("20250606"), &json!(20250606)) == 0);
        assert!(compare_values(&json!(20250607), &json!("20250606")) > 0);
        assert!(compare_values(&json!("20250605"), &json!(20250606)) < 0);
    }

    #[test]
    fn like_empty_matches_any_scalar_id() {
        let filter = SearchFilter {
            field: "id".into(),
            filter_type: "like".into(),
            value: json!(""),
            ..Default::default()
        };
        let mut row = serde_json::Map::new();
        row.insert("id".into(), json!(12345));
        assert!(SearchFilter::matches(&row, &filter));
    }

    #[test]
    fn field_ngay_range_matches_numeric_storage() {
        let filter = SearchFilter {
            operator: "AND".into(),
            conditions: vec![
                SearchFilter {
                    field: "field_ngay".into(),
                    filter_type: "gte".into(),
                    value: json!("20250601"),
                    ..Default::default()
                },
                SearchFilter {
                    field: "field_ngay".into(),
                    filter_type: "lte".into(),
                    value: json!("20250630"),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let mut row = serde_json::Map::new();
        row.insert("field_ngay".into(), json!(20250606));
        assert!(SearchFilter::matches(&row, &filter));
    }
}
