package model

import (
	"reflect"
	"testing"
)

func TestStringListFromValueParsesJSONArrayString(t *testing.T) {
	got := stringListFromValue(`["view","edit","scope:owner"]`)
	want := []string{"view", "edit", "scope:owner"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestStringListFromValueParsesCommaSeparatedString(t *testing.T) {
	got := stringListFromValue("view, edit, create")
	want := []string{"view", "edit", "create"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}
