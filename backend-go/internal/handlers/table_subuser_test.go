package handlers

import (
	"testing"

	"csm_server/backend-go/internal/security"
)

func TestValidateSubUserSelfEditIgnoresUnchangedPermissionsArray(t *testing.T) {
	access := &security.UserAccessContext{
		IsSubUser:       true,
		OwnerCandidates: []string{"sub-1"},
	}
	records := []map[string]any{
		{"id": "sub-1", "permissions": []any{"view", "edit", "scope:owner"}},
	}
	objUpdate := map[string]any{
		"permissions": []any{"view", "edit", "scope:owner"},
		"full_name":   "Updated Name",
	}
	if msg := validateSubUserSelfEdit(objUpdate, records, access); msg != "" {
		t.Fatalf("expected unchanged permissions to pass, got %q", msg)
	}
}

func TestValidateSubUserSelfEditBlocksPermissionChange(t *testing.T) {
	access := &security.UserAccessContext{
		IsSubUser:       true,
		OwnerCandidates: []string{"sub-1"},
	}
	records := []map[string]any{
		{"id": "sub-1", "permissions": []any{"view"}},
	}
	objUpdate := map[string]any{
		"permissions": []any{"view", "admin"},
	}
	if msg := validateSubUserSelfEdit(objUpdate, records, access); msg == "" {
		t.Fatal("expected permission change to be blocked")
	}
}
