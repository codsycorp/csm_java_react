package security

import "testing"

func TestNormalizeDataAppIdsField_DevCanAssignMultipleApps(t *testing.T) {
	row := map[string]any{
		"app_id":       "lmkt",
		"data_app_ids": []any{"lmkt", "kqxs", "tonghop"},
	}
	ctx := &UserAccessContext{IsDev: true, AppID: "csm"}
	NormalizeDataAppIdsField(row, ctx)
	apps, ok := row["data_app_ids"].([]string)
	if !ok {
		t.Fatalf("data_app_ids type = %T", row["data_app_ids"])
	}
	if len(apps) != 2 {
		t.Fatalf("apps = %#v, want kqxs+tonghop only", apps)
	}
}

func TestNormalizeDataAppIdsField_NonDevIntersectParentAllowed(t *testing.T) {
	row := map[string]any{
		"app_id":       "lmkt",
		"data_app_ids": []any{"kqxs", "forbidden"},
	}
	ctx := &UserAccessContext{
		AppID:      "lmkt",
		DataAppIDs: []string{"kqxs", "tonghop"},
	}
	NormalizeDataAppIdsField(row, ctx)
	apps := row["data_app_ids"].([]string)
	if len(apps) != 1 || apps[0] != "kqxs" {
		t.Fatalf("apps = %#v, want only allowed kqxs", apps)
	}
}

func TestCanAccessAppData_WithSupplementalApps(t *testing.T) {
	auth := AuthUser{
		AppID:      "lmkt",
		DataAppIDs: []string{"kqxs"},
	}
	if !auth.CanAccessAppData("lmkt") {
		t.Fatal("expected home app access")
	}
	if !auth.CanAccessAppData("kqxs") {
		t.Fatal("expected supplemental app access")
	}
	if auth.CanAccessAppData("other") {
		t.Fatal("unexpected access to unrelated app")
	}
}
