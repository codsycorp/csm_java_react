package security

import "testing"

func TestApplyDataScopeCreateGuardStampsCreatedBy(t *testing.T) {
	access := &UserAccessContext{
		DataScope:       "OWNER",
		OwnerCandidates: []string{"sub-user-1"},
	}
	row := map[string]any{"name": "item"}
	if msg := ApplyDataScopeCreateGuard("demo", "orders", row, access, nil); msg != "" {
		t.Fatalf("unexpected guard error: %q", msg)
	}
	if got := row["created_by"]; got != nil && got != "" {
		t.Fatalf("scope-less table should not stamp created_by, got %v", got)
	}
}

func TestApplyDataScopeCreateGuardRejectsForeignOwner(t *testing.T) {
	access := &UserAccessContext{
		DataScope:       "OWNER",
		OwnerCandidates: []string{"sub-user-1"},
	}
	row := map[string]any{"created_by": "other-user"}
	if msg := ApplyDataScopeCreateGuard("demo", "orders", row, access, nil); msg != "" {
		t.Fatalf("scope-less table should skip owner guard, got %q", msg)
	}
}

func TestValidateActionPermissionViewAllowsEditOnScopelessTable(t *testing.T) {
	ctx := &UserAccessContext{
		AppID:       "kqxs",
		Permissions: []string{"view", "scope:owner"},
		DataScope:   "OWNER",
	}
	if msg := ValidateActionPermissionForTable(ctx, "edit", "kqxs", "kqxs_longan", nil); msg != "" {
		t.Fatalf("expected view to allow edit on scope-less table, got %q", msg)
	}
}

func TestValidateActionPermissionViewAllowsEditOnKqxsLegacyTable(t *testing.T) {
	ctx := &UserAccessContext{
		AppID:       "kqxs",
		Permissions: []string{"view", "scope:owner"},
		DataScope:   "OWNER",
	}
	if msg := ValidateActionPermissionForTable(ctx, "edit", "kqxs", "kqxs_angiang", nil); msg != "" {
		t.Fatalf("expected view to allow edit on kqxs legacy table, got %q", msg)
	}
}

func TestValidateActionPermissionLegacyParityRejectsWithoutView(t *testing.T) {
	ctx := &UserAccessContext{
		AppID:       "kqxs",
		Permissions: []string{"scope:owner"},
		DataScope:   "OWNER",
	}
	if msg := ValidateActionPermissionForTable(ctx, "edit", "kqxs", "kqxs_angiang", nil); msg == "" {
		t.Fatal("expected missing view to block edit even on kqxs legacy table")
	}
}

func TestValidateActionPermissionLegacyParityRejectsDelete(t *testing.T) {
	ctx := &UserAccessContext{
		AppID:       "kqxs",
		Permissions: []string{"view", "scope:owner"},
		DataScope:   "OWNER",
	}
	if msg := ValidateActionPermissionForTable(ctx, "delete", "kqxs", "kqxs_angiang", nil); msg == "" {
		t.Fatal("legacy view parity must not grant delete")
	}
}

func TestValidateActionPermissionLegacyParityRejectsSystemTables(t *testing.T) {
	ctx := &UserAccessContext{
		AppID:       "csm",
		Permissions: []string{"view", "scope:owner"},
		DataScope:   "OWNER",
	}
	if msg := ValidateActionPermissionForTable(ctx, "edit", "csm", "csm_roles", nil); msg == "" {
		t.Fatal("legacy view parity must not apply to csm_ tables")
	}
}

func TestValidateActionPermissionLegacyParityRejectsUnknownTableWithoutSchema(t *testing.T) {
	ctx := &UserAccessContext{
		AppID:       "demo",
		Permissions: []string{"view", "scope:owner"},
		DataScope:   "OWNER",
	}
	if msg := ValidateActionPermissionForTable(ctx, "edit", "demo", "orders", nil); msg == "" {
		t.Fatal("unknown business table without schema metadata must not inherit view→edit")
	}
}

func TestTableHasPermissionScopeFieldsWithoutSchema(t *testing.T) {
	if TableHasPermissionScopeFields(nil, "kqxs", "kqxs_longan") {
		t.Fatal("missing schema metadata should be treated as scope-less table")
	}
}

func TestMatchesByFieldsAllowsLegacyRowsWithoutScopeMarkers(t *testing.T) {
	row := map[string]any{"id": "kqxs_quangbinh_20260611", "field_ngay": "20260611"}
	allowed := []string{"sub-user-1"}
	if !matchesByFields(row, ownerScopeFields, allowed) {
		t.Fatal("legacy row without scope markers should remain visible")
	}
}

func TestMatchesByFieldsRejectsForeignOwnerMarker(t *testing.T) {
	row := map[string]any{"created_by": "other-user"}
	allowed := []string{"sub-user-1"}
	if matchesByFields(row, ownerScopeFields, allowed) {
		t.Fatal("row with foreign owner marker should be filtered out")
	}
}

func TestEnsureBusinessPermissionSchemaValues(t *testing.T) {
	access := &UserAccessContext{
		DataScope:       "OWNER",
		OwnerCandidates: []string{"sub-user-1"},
	}
	row := map[string]any{}
	EnsureBusinessPermissionSchemaValues("demo", "orders", row, access, nil)
	if row["permissionSchemaVersion"] != nil && row["permissionSchemaVersion"] != "" {
		t.Fatalf("scope-less table should not auto-fill permission schema, got %v", row["permissionSchemaVersion"])
	}
}
