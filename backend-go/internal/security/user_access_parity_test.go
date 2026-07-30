package security

import (
	"testing"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/util"
)

func TestUserAccessFromAuthMainAccountElevation(t *testing.T) {
	auth := &AuthUser{
		AppID:       "lmkt",
		Permissions: []string{"admin"},
		AppToken:    "token",
	}
	ctx := UserAccessFromAuth(auth, nil)
	if ctx == nil {
		t.Fatal("expected access context")
	}
	if !ctx.IsAdmin {
		t.Fatal("main account should be admin")
	}
	if !util.HasActionPermission(ctx.Permissions, "view") {
		t.Fatalf("main account should have view, got %v", ctx.Permissions)
	}
	if ctx.DataScope != "ALL" {
		t.Fatalf("main account data scope should be ALL, got %q", ctx.DataScope)
	}
}

func TestUserAccessFromAuthSubUserKeepsScopeAll(t *testing.T) {
	auth := &AuthUser{
		AppID:              "lmkt",
		IsSubUser:          true,
		Permissions:        []string{"view", "scope:all"},
		PermissionBitfield: util.ToCompactToken(util.BuildBitfield([]string{"view", "scope:all"}, []string{"lmkt"}, false)),
		AppToken:           "sub-token",
	}
	ctx := UserAccessFromAuth(auth, nil)
	if ctx == nil {
		t.Fatal("expected access context")
	}
	if ctx.IsAdmin {
		t.Fatal("sub-user should not be admin")
	}
	if !util.HasActionPermission(ctx.Permissions, "view") {
		t.Fatalf("sub-user should keep view, got %v", ctx.Permissions)
	}
	for _, forbidden := range []string{"admin", "dev"} {
		if util.HasActionPermission(ctx.Permissions, forbidden) {
			t.Fatalf("sub-user should not have %q, got %v", forbidden, ctx.Permissions)
		}
	}
}

func TestUserAccessFromAuthMainAccountIgnoresLegacyUserRoleToken(t *testing.T) {
	auth := &AuthUser{
		AppID:       "lmkt",
		IsSubUser:   false,
		Permissions: []string{"view"},
		AppToken:    "lmkt_____owner@test.com_____user_____0",
	}
	ctx := UserAccessFromAuth(auth, nil)
	if ctx == nil {
		t.Fatal("expected access context")
	}
	if ctx.IsSubUser {
		t.Fatal("main account must not be classified as sub-user from legacy token role")
	}
	if !ctx.IsAdmin {
		t.Fatal("main account should keep admin semantics")
	}
}

func TestFilterSysAutosRowsUsesResolvedEffectiveAppID(t *testing.T) {
	ctx := &UserAccessContext{
		AppID:            "csm",
		IsAdmin:          true,
		MenusPermissions: []string{"wuweb"},
		DataAppIDs:       []string{"wuweb"},
	}
	rows := []any{
		map[string]any{"p_name": "broadcast_wuweb", "p_type": 0, "p_code": "ok"},
	}
	filter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("p_name", "broadcast_wuweb"),
			model.EqFilter("p_type", 0),
		},
	}
	out := FilterSysAutosRows(rows, filter, ctx)
	if len(out) != 1 {
		t.Fatalf("admin with wuweb scope should read broadcast_wuweb, got %d rows", len(out))
	}
}

func TestFilterSysAutosRowsRejectsCrossAppForNonDev(t *testing.T) {
	ctx := &UserAccessContext{
		AppID: "lmkt",
	}
	rows := []any{
		map[string]any{"p_name": "broadcast_wuweb", "p_type": 0, "p_code": "ok"},
	}
	filter := model.EqFilter("p_name", "broadcast_wuweb")
	if len(FilterSysAutosRows(rows, filter, ctx)) != 0 {
		t.Fatal("lmkt user must not read broadcast_wuweb")
	}
}

func TestValidatePermissionGroupAppBoundaryMainAdminCanManageReachableApp(t *testing.T) {
	ctx := &UserAccessContext{
		AppID:      "lmkt",
		IsDev:      false,
		IsAdmin:    true,
		DataAppIDs: []string{"other-app"},
	}
	if msg := ValidatePermissionGroupAppBoundary("other-app", "csm_roles", ctx); msg != "" {
		t.Fatalf("expected reachable cross-app csm_roles access to be allowed, got %q", msg)
	}
	if msg := ValidatePermissionGroupAppBoundary("lmkt", "csm_roles", ctx); msg != "" {
		t.Fatalf("expected same-app access, got %q", msg)
	}
}

func TestValidatePermissionGroupAppBoundarySubUserStillBlockedCrossApp(t *testing.T) {
	ctx := &UserAccessContext{
		AppID:      "lmkt",
		IsDev:      false,
		IsAdmin:    false,
		IsSubUser:  true,
		DataAppIDs: []string{"other-app"},
	}
	if msg := ValidatePermissionGroupAppBoundary("other-app", "csm_roles", ctx); msg == "" {
		t.Fatal("expected sub-user cross-app csm_roles access to be denied")
	}
}
