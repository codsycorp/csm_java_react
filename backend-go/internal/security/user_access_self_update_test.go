package security

import (
	"testing"
)

func TestFilterRowsForUpdateAllowsSelfManagedAccountEvenWhenVisibilityCacheEmpty(t *testing.T) {
	ctx := &UserAccessContext{
		IsAdmin:         true,
		IsDev:           false,
		OwnerCandidates: []string{"admin@test.com", "admin-user-id"},
	}
	row := map[string]any{
		"id":       "admin-user-id",
		"email":    "admin@test.com",
		"username": "admin",
	}
	// Empty visible map simulates cache miss from optimized account visibility loader.
	filtered := filterRowsForUpdate("csm_accounts", []map[string]any{row}, ctx, "csm", nil, true)
	if len(filtered) != 1 {
		t.Fatalf("expected self row to pass update filter, got %d rows", len(filtered))
	}
}

func TestFilterRowsForUpdateAllowsSubUserSelfRow(t *testing.T) {
	ctx := &UserAccessContext{
		IsSubUser:       true,
		IsDev:           false,
		OwnerCandidates: []string{"sub-user-id"},
	}
	row := map[string]any{
		"id":                "sub-user-id",
		"login_identifier":  "sub@test.com",
		"parent_account_id": "csm",
	}
	filtered := filterRowsForUpdate("csm_group_members", []map[string]any{row}, ctx, "csm", nil, true)
	if len(filtered) != 1 {
		t.Fatalf("expected sub-user self row to pass update filter, got %d rows", len(filtered))
	}
}

func TestFilterRowsForUpdateAdminAllowsReachableSubUserApp(t *testing.T) {
	ctx := &UserAccessContext{
		IsAdmin:                 true,
		IsDev:                   false,
		AppID:                   "lmkt",
		DataAppIDs:              []string{"kqxs"},
		ParentAccountCandidates: []string{"admin-1"},
	}
	row := map[string]any{
		"id":                "sub-1",
		"login_identifier":  "sub1@test.com",
		"parent_account_id": "another-admin",
		"app_id":            "kqxs",
	}
	filtered := filterRowsForUpdate("csm_group_members", []map[string]any{row}, ctx, "csm", nil, true)
	if len(filtered) != 1 {
		t.Fatalf("expected admin to update sub-user in reachable app, got %d rows", len(filtered))
	}
}

func TestFilterRowsForUpdateAdminBlocksUnreachableSubUserApp(t *testing.T) {
	ctx := &UserAccessContext{
		IsAdmin:                 true,
		IsDev:                   false,
		AppID:                   "lmkt",
		DataAppIDs:              []string{"kqxs"},
		ParentAccountCandidates: []string{"admin-1"},
	}
	row := map[string]any{
		"id":                "sub-2",
		"login_identifier":  "sub2@test.com",
		"parent_account_id": "another-admin",
		"app_id":            "crm",
	}
	filtered := filterRowsForUpdate("csm_group_members", []map[string]any{row}, ctx, "csm", nil, true)
	if len(filtered) != 0 {
		t.Fatalf("expected admin to be blocked outside reachable app scope, got %d rows", len(filtered))
	}
}
