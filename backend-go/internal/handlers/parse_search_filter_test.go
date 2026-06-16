package handlers

import (
	"testing"

	"csm_server/backend-go/internal/model"
)

func TestParseSearchFilterPlainMapByID(t *testing.T) {
	filter := parseSearchFilter(map[string]any{
		"e_where": map[string]any{
			"id": "user-123",
		},
	})
	if filter.Field != "id" || filter.FilterType != "eq" {
		t.Fatalf("expected id eq filter, got field=%q type=%q", filter.Field, filter.FilterType)
	}
	if filter.Value != "user-123" {
		t.Fatalf("expected value user-123, got %v", filter.Value)
	}
}

func TestParseSearchFilterStructuredCondition(t *testing.T) {
	filter := parseSearchFilter(map[string]any{
		"e_where": map[string]any{
			"field": "email",
			"type":  "eq",
			"value": "user@test.com",
		},
	})
	if filter.Field != "email" || filter.FilterType != "eq" {
		t.Fatalf("expected email eq filter, got field=%q type=%q", filter.Field, filter.FilterType)
	}
}

func TestParseSearchFilterPlainMapAND(t *testing.T) {
	filter := parseSearchFilter(map[string]any{
		"where": map[string]any{
			"id":                "user-123",
			"login_identifier": "sub@test.com",
		},
	})
	if filter.Operator != "AND" || len(filter.Conditions) != 2 {
		t.Fatalf("expected AND with 2 conditions, got operator=%q len=%d", filter.Operator, len(filter.Conditions))
	}
}

func TestPlainMapToSearchFilterEmpty(t *testing.T) {
	filter := plainMapToSearchFilter(map[string]any{})
	if !isEmptySearchFilter(filter) {
		t.Fatalf("expected empty filter")
	}
}

func TestParseSearchFilterMatchesEqFilterHelper(t *testing.T) {
	expected := model.EqFilter("id", "abc")
	filter := parseSearchFilter(map[string]any{
		"e_where": map[string]any{"id": "abc"},
	})
	if filter.Field != expected.Field || filter.FilterType != expected.FilterType || filter.Value != expected.Value {
		t.Fatalf("unexpected filter: %+v", filter)
	}
}
