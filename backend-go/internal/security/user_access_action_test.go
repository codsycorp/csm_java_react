package security

import (
	"testing"

	"csm_server/backend-go/internal/util"
)

func TestValidateActionPermissionUsesBitfieldFallback(t *testing.T) {
	token := util.BuildBitfield([]string{"view", "edit", "scope:owner"}, nil, false)
	ctx := &UserAccessContext{
		Permissions:           []string{"view"},
		ParsedPermissionToken: token,
	}
	if msg := ValidateActionPermission(ctx, "edit"); msg != "" {
		t.Fatalf("expected edit allowed via bitfield, got %q", msg)
	}
}

func TestValidateActionPermissionAcceptsUpdateAlias(t *testing.T) {
	ctx := &UserAccessContext{
		Permissions: []string{"view", "update", "scope:owner"},
	}
	if msg := ValidateActionPermission(ctx, "edit"); msg != "" {
		t.Fatalf("expected update alias to satisfy edit, got %q", msg)
	}
}
