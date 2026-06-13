package model

import "testing"

func TestSearchFilterCollectLikeTerms(t *testing.T) {
	filter := SearchFilter{
		Operator: "AND",
		Conditions: []SearchFilter{
			{Field: "email", FilterType: "eq", Value: "a@b.com"},
			{Field: "name", FilterType: "like", Value: "%Nguyen%"},
		},
	}
	terms := filter.CollectLikeTerms()
	if len(terms) != 1 || terms[0] != "%Nguyen%" {
		t.Fatalf("unexpected terms: %#v", terms)
	}
	if !filter.HasLike() {
		t.Fatal("expected HasLike true")
	}
}

func TestSearchFilterHasLikeFalse(t *testing.T) {
	filter := EqFilter("id", "1")
	if filter.HasLike() {
		t.Fatal("expected HasLike false")
	}
}
