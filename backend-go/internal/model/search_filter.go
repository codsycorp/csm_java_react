package model

import (
	"math"
	"strconv"
	"strings"
)

type SearchFilter struct {
	Operator   string         `json:"operator"`
	Conditions []SearchFilter `json:"conditions"`
	Field      string         `json:"field"`
	FilterType string         `json:"type"`
	Value      any            `json:"value"`
}

func EqFilter(field string, value any) SearchFilter {
	return SearchFilter{
		Operator:   "AND",
		Field:      field,
		FilterType: "eq",
		Value:      value,
	}
}

func (f SearchFilter) Type() string { return f.FilterType }

func (f SearchFilter) HasLike() bool {
	if strings.EqualFold(f.FilterType, "like") {
		if s, ok := asString(f.Value); ok && strings.TrimSpace(s) != "" {
			return true
		}
	}
	for _, c := range f.Conditions {
		if c.HasLike() {
			return true
		}
	}
	return false
}

func (f SearchFilter) CollectLikeTerms() []string {
	var out []string
	f.collectLikeTermsInto(&out)
	return out
}

func (f SearchFilter) collectLikeTermsInto(out *[]string) {
	if len(f.Conditions) > 0 {
		for _, c := range f.Conditions {
			c.collectLikeTermsInto(out)
		}
		return
	}
	if strings.EqualFold(f.FilterType, "like") {
		if s, ok := asString(f.Value); ok {
			s = strings.TrimSpace(s)
			if s != "" {
				*out = append(*out, s)
			}
		}
	}
}

func (f SearchFilter) ValueString() string {
	switch v := f.Value.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return strconv.FormatInt(int64(v), 10)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	default:
		if f.Value == nil {
			return ""
		}
		return strings.TrimSpace(stringify(f.Value))
	}
}

func (f SearchFilter) Matches(record map[string]any) bool {
	if len(f.Conditions) > 0 {
		if strings.EqualFold(f.Operator, "OR") {
			for _, c := range f.Conditions {
				if c.Matches(record) {
					return true
				}
			}
			return false
		}
		for _, c := range f.Conditions {
			if !c.Matches(record) {
				return false
			}
		}
		return true
	}
	if f.Field == "" || f.FilterType == "" {
		return true
	}
	actual, ok := record[f.Field]
	if !ok {
		switch f.FilterType {
		case "isnull", "isNull":
			return true
		case "isnotnull", "notNull":
			return false
		default:
			return false
		}
	}
	return evaluateCondition(actual, f.FilterType, f.Value)
}

func evaluateCondition(actual any, op string, expected any) bool {
	switch op {
	case "eq":
		if valuesEqual(actual, expected) {
			return true
		}
		a, okA := asFloat64(actual)
		e, okE := asFloat64(expected)
		if okA && okE {
			return math.Abs(a-e) < 1e-9
		}
		return false
	case "eqIgnoreCase":
		as, okA := asString(actual)
		es, okE := asString(expected)
		return okA && okE && strings.EqualFold(strings.TrimSpace(as), strings.TrimSpace(es))
	case "ne":
		return !valuesEqual(actual, expected)
	case "gt":
		return compareValues(actual, expected) > 0
	case "gte":
		return compareValues(actual, expected) >= 0
	case "lt":
		return compareValues(actual, expected) < 0
	case "lte":
		return compareValues(actual, expected) <= 0
	case "in":
		arr, ok := expected.([]any)
		if !ok {
			return false
		}
		for _, item := range arr {
			if valuesEqual(actual, item) {
				return true
			}
		}
		return false
	case "notIn":
		arr, ok := expected.([]any)
		if !ok {
			return true
		}
		for _, item := range arr {
			if valuesEqual(actual, item) {
				return false
			}
		}
		return true
	case "like":
		es, okE := asString(expected)
		if !okE || es == "" {
			return true
		}
		as, okA := compareString(actual)
		return okA && strings.Contains(strings.ToLower(as), strings.ToLower(es))
	case "prefix":
		as, okA := asString(actual)
		es, okE := asString(expected)
		return okA && okE && strings.HasPrefix(strings.ToLower(as), strings.ToLower(es))
	case "isnotnull", "notNull":
		return actual != nil
	case "isnull", "isNull":
		return actual == nil
	case "noteq", "notEq":
		if valuesEqual(actual, expected) {
			return false
		}
		if actual == nil {
			if es, ok := asString(expected); ok {
				return es != ""
			}
			return true
		}
		return true
	default:
		return false
	}
}

// ValuesEqual compares filter values with loose numeric/string equality (Java parity).
func ValuesEqual(a, b any) bool {
	return valuesEqual(a, b)
}

func valuesEqual(a, b any) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	switch av := a.(type) {
	case string:
		if bv, ok := b.(string); ok {
			return av == bv
		}
	case float64:
		if bv, ok := asFloat64(b); ok {
			return math.Abs(av-bv) < 1e-9
		}
	case bool:
		if bv, ok := b.(bool); ok {
			return av == bv
		}
	}
	return stringify(a) == stringify(b)
}

func compareValues(a, b any) int {
	af, okA := asFloat64(a)
	bf, okB := asFloat64(b)
	if okA && okB {
		switch {
		case af < bf:
			return -1
		case af > bf:
			return 1
		default:
			return 0
		}
	}
	as, okAS := compareString(a)
	bs, okBS := compareString(b)
	if okAS && okBS {
		return strings.Compare(as, bs)
	}
	return strings.Compare(stringify(a), stringify(b))
}

func asFloat64(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(n), 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func asString(v any) (string, bool) {
	if s, ok := v.(string); ok {
		return s, true
	}
	return "", false
}

func compareString(v any) (string, bool) {
	if s, ok := v.(string); ok {
		return s, true
	}
	if f, ok := asFloat64(v); ok {
		return strconv.FormatFloat(f, 'f', -1, 64), true
	}
	return "", false
}

func stringify(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	if f, ok := asFloat64(v); ok {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	return ""
}
