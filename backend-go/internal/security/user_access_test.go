package security

import (
	"testing"

	"csm_server/backend-go/internal/model"
)

func TestResolveSystemUserTableForReadRewritesAdminList(t *testing.T) {
	ctx := &UserAccessContext{
		IsAdmin: true,
		IsDev:   false,
		OwnerCandidates: []string{
			"user-1",
		},
		ParentAccountCandidates: []string{"csm"},
		Permissions:             []string{"admin", "view", "create", "edit", "delete", "export", "scope:all"},
	}
	filter := model.SearchFilter{
		Field:      "id",
		FilterType: "like",
		Value:      "",
	}
	table, _ := ResolveSystemUserTableForRead("csm_accounts", false, map[string]any{}, filter, ctx)
	if table != "csm_group_members" {
		t.Fatalf("expected csm_group_members, got %s", table)
	}
}

func TestResolveSystemUserTableForReadKeepsSelfProfile(t *testing.T) {
	ctx := &UserAccessContext{
		IsAdmin:         true,
		IsDev:           false,
		OwnerCandidates: []string{"user@test.com"},
		Permissions:     []string{"admin", "view"},
	}
	filter := model.EqFilter("email", "user@test.com")
	table, _ := ResolveSystemUserTableForRead("csm_accounts", false, map[string]any{}, filter, ctx)
	if table != "csm_accounts" {
		t.Fatalf("expected self profile to stay on csm_accounts, got %s", table)
	}
}

func TestValidateSystemUserTableAccessAllowsDev(t *testing.T) {
	ctx := &UserAccessContext{IsDev: true}
	if msg := ValidateSystemUserTableAccess("csm_accounts", false, nil, model.SearchFilter{}, ctx); msg != "" {
		t.Fatalf("dev should bypass validation, got %q", msg)
	}
}
