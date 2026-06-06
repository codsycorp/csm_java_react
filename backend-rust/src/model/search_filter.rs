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
            None => false,
            Some(actual) => Self::evaluate_condition(actual, &filter.filter_type, &filter.value),
        }
    }

    fn evaluate_condition(actual: &Value, op: &str, expected: &Value) -> bool {
        match op {
            "eq" => actual == expected,
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
                if let (Some(a), Some(e)) = (actual.as_str(), expected.as_str()) {
                    a.to_lowercase().contains(&e.to_lowercase())
                } else {
                    false
                }
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
            _ => false,
        }
    }
}

fn compare_values(a: &Value, b: &Value) -> i32 {
    match (a.as_f64(), b.as_f64()) {
        (Some(aa), Some(bb)) => aa.partial_cmp(&bb).unwrap_or(std::cmp::Ordering::Equal) as i32,
        _ => {
            if let (Some(aa), Some(bb)) = (a.as_str(), b.as_str()) {
                aa.cmp(bb) as i32
            } else {
                0
            }
        }
    }
}
