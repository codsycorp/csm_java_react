package util

import "testing"

func TestHasActionPermissionAcceptsUpdateAliasForEdit(t *testing.T) {
	if !HasActionPermission([]string{"view", "update"}, "edit") {
		t.Fatal("update permission should satisfy edit action check")
	}
}

func TestHasBitfieldActionPermissionEdit(t *testing.T) {
	token := BuildBitfield([]string{"view", "edit", "scope:owner"}, nil, false)
	if !HasBitfieldActionPermission(token, "edit") {
		t.Fatal("bitfield with edit bit should satisfy edit action check")
	}
	if HasBitfieldActionPermission(token, "delete") {
		t.Fatal("bitfield without delete should not satisfy delete action check")
	}
}
