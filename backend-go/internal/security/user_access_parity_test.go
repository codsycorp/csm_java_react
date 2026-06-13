package security

import (
	"testing"

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

func TestValidatePermissionGroupAppBoundaryStrictSameApp(t *testing.T) {
	ctx := &UserAccessContext{
		AppID:  "lmkt",
		IsDev:  false,
		IsAdmin: true,
		DataAppIDs: []string{"other-app"},
	}
	if msg := ValidatePermissionGroupAppBoundary("other-app", "csm_roles", ctx); msg == "" {
		t.Fatal("expected cross-app csm_roles access to be denied")
	}
	if msg := ValidatePermissionGroupAppBoundary("lmkt", "csm_roles", ctx); msg != "" {
		t.Fatalf("expected same-app access, got %q", msg)
	}
}
