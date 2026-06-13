package util

import "testing"

func TestExpandPermissionPresetsEditor(t *testing.T) {
	got := ExpandPermissionPresets([]string{"editor", "scope:owner"})
	if !HasActionPermission(got, "edit") {
		t.Fatalf("editor preset should expand to edit, got %v", got)
	}
	if !HasActionPermission(got, "create") {
		t.Fatalf("editor preset should expand to create, got %v", got)
	}
}
