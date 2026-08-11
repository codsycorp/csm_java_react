package services

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/util"
)

func testRecordManager(t *testing.T) *data.RecordManager {
	t.Helper()
	dataDir := filepath.Join("..", "..", "..", "backend", "csm_datas")
	if _, err := os.Stat(filepath.Join(dataDir, "native", "pebble")); err != nil {
		t.Skip("pebble store not present")
	}
	os.Setenv("APP_DATA_DIR", dataDir)
	cfg := config.LoadFromEnv()
	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("open pebble: %v", err)
	}
	t.Cleanup(rm.ShutdownAll)
	return rm
}
func TestMapSubUserDoesNotInheritParentAppToken(t *testing.T) {
	rm := testRecordManager(t)
	parentID := "parent-2"
	appID := "demo2"
	parentToken := rm.CsmEncrypt(appID + "_____owner@test.com_____admin_____0")
	_, err := rm.CreateRecord(CSMAppID, AccountsTable, map[string]any{
		"id": parentID, "email": "owner@test.com", "username": "owner@test.com",
		"app_id": appID, "app_token": parentToken, "permissions": []any{"admin"},
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	subID := "sub-no-token"
	_, err = rm.CreateRecord(CSMAppID, SubAccountsTable, map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "child@test.com",
		"permissions": []any{"view"}, "menusPermissions": []any{appID},
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	us := NewUserService(rm)
	user := us.mapSubUser(map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "child@test.com",
		"permissions": []any{"view"}, "menusPermissions": []any{appID},
	})
	if user == nil {
		t.Fatal("expected mapped sub-user")
	}
	if user.AppToken != nil && *user.AppToken == parentToken {
		t.Fatal("sub-user must not inherit parent app_token")
	}
	if user.AppToken == nil || *user.AppToken == "" {
		t.Fatal("expected generated sub-user app_token")
	}
	meta := util.ParseAppToken(rm, *user.AppToken)
	if meta.Role != "user" {
		t.Fatalf("expected sub-user role user, got %q", meta.Role)
	}
}

func TestMapSubUserStripsAdminAndEnsuresView(t *testing.T) {
	rm := testRecordManager(t)
	parentID := "parent-1"
	appID := "demo"
	parentToken := rm.CsmEncrypt(appID + "_____admin@test.com_____admin_____0")
	_, err := rm.CreateRecord(CSMAppID, AccountsTable, map[string]any{
		"id": parentID, "email": "admin@test.com", "username": "admin@test.com",
		"app_id": appID, "app_token": parentToken, "permissions": []any{"admin"},
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	subToken := rm.CsmEncrypt(appID + "_____staff@test.com_____user_____0")
	subID := "sub-1"
	_, err = rm.CreateRecord(CSMAppID, SubAccountsTable, map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "staff@test.com",
		"app_id": appID, "app_token": subToken,
		"permissions": []any{"admin", "view", "edit"}, "menusPermissions": []any{appID},
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	us := NewUserService(rm)
	user := us.mapSubUser(map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "staff@test.com",
		"app_token": subToken, "permissions": []any{"admin", "view", "edit"},
		"menusPermissions": []any{appID},
	})
	if user == nil {
		t.Fatal("expected mapped sub-user")
	}
	if user.IsSubUser == nil || !*user.IsSubUser {
		t.Fatal("expected isSubUser=true")
	}
	if user.Dev != nil && *user.Dev {
		t.Fatal("sub-user must not be dev")
	}
	if util.HasActionPermission(user.Permissions, "admin") {
		t.Fatalf("admin must be stripped from sub-user permissions: %v", user.Permissions)
	}
	if !util.HasActionPermission(user.Permissions, "view") {
		t.Fatalf("expected view permission, got %v", user.Permissions)
	}
	if user.ID == nil || *user.ID != subID {
		t.Fatalf("expected sub-user id preserved, got %v", user.ID)
	}
}

func TestMapSubUserUsesEarlierParentExpiry(t *testing.T) {
	rm := newTempRecordManager(t)
	parentID := "parent-expiry"
	appID := "demo-expiry"
	parentExpiry := time.Date(2035, 1, 1, 23, 59, 59, 0, time.UTC).UnixMilli()
	childExpiry := time.Date(2035, 2, 1, 23, 59, 59, 0, time.UTC).UnixMilli()
	parentToken := rm.CsmEncrypt(appID + "_____owner-expiry@test.com_____admin_____0")
	_, err := rm.CreateRecord(CSMAppID, AccountsTable, map[string]any{
		"id": parentID, "email": "owner-expiry@test.com", "username": "owner-expiry@test.com",
		"app_id": appID, "app_token": parentToken, "permissions": []any{"admin"},
		"account_expiry_at": parentExpiry,
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	subID := "sub-expiry"
	_, err = rm.CreateRecord(CSMAppID, SubAccountsTable, map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "child-expiry@test.com",
		"app_id": appID, "account_expiry_at": childExpiry,
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	us := NewUserService(rm)
	user := us.mapSubUser(map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "child-expiry@test.com",
		"app_id": appID, "account_expiry_at": childExpiry,
	})
	if user == nil {
		t.Fatal("expected mapped sub-user")
	}
	if user.AccountExpiryAt == nil {
		t.Fatal("expected sub-user expiry to be set")
	}
	if got := *user.AccountExpiryAt; got != parentExpiry {
		t.Fatalf("expected parent expiry %d, got %d", parentExpiry, got)
	}
}

func TestMapSubUserKeepsRecordEditorWhenRoleIsViewOnly(t *testing.T) {
	rm := testRecordManager(t)
	parentID := "parent-kqxs-editor"
	appID := "kqxs"
	parentToken := rm.CsmEncrypt(appID + "_____owner3@test.com_____admin_____0")
	_, err := rm.CreateRecord(CSMAppID, AccountsTable, map[string]any{
		"id": parentID, "email": "owner3@test.com", "username": "owner3@test.com",
		"app_id": appID, "app_token": parentToken, "permissions": []any{"admin"},
		"menusPermissions": []any{appID},
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	roleID := "role-view-only"
	_, err = rm.CreateRecord(appID, "csm_roles", map[string]any{
		"id": roleID, "role_code": roleID, "permissions": []any{"view"},
		"menusPermissions": []any{appID},
	}, []string{"id", "role_code"})
	if err != nil {
		t.Fatal(err)
	}

	subToken := rm.CsmEncrypt(appID + "_____staff3@test.com_____user_____0")
	subID := "sub-editor-record"
	_, err = rm.CreateRecord(CSMAppID, SubAccountsTable, map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "staff3@test.com",
		"app_id": appID, "app_token": subToken, "group_id": roleID,
		"permissions": []any{"editor"}, "menusPermissions": []any{appID},
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	us := NewUserService(rm)
	user := us.mapSubUser(map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "staff3@test.com",
		"app_token": subToken, "group_id": roleID,
		"permissions": []any{"editor"}, "menusPermissions": []any{appID},
	})
	if user == nil {
		t.Fatal("expected mapped sub-user")
	}
	if !util.HasActionPermission(user.Permissions, "edit") {
		t.Fatalf("record editor preset must survive view-only role, got %v", user.Permissions)
	}
}

func TestMapSubUserMergesExplicitPermissionsOverStaleBitfield(t *testing.T) {
	rm := testRecordManager(t)
	parentID := "parent-stale-bitfield"
	appID := "kqxs"
	parentToken := rm.CsmEncrypt(appID + "_____owner2@test.com_____admin_____0")
	_, err := rm.CreateRecord(CSMAppID, AccountsTable, map[string]any{
		"id": parentID, "email": "owner2@test.com", "username": "owner2@test.com",
		"app_id": appID, "app_token": parentToken, "permissions": []any{"admin"},
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	subToken := rm.CsmEncrypt(appID + "_____editor@test.com_____user_____0")
	subID := "sub-stale-bitfield"
	viewOnlyBitfield := util.ToCompactToken(util.BuildBitfield([]string{"view", "scope:owner"}, []string{appID}, false))
	_, err = rm.CreateRecord(CSMAppID, SubAccountsTable, map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "editor@test.com",
		"app_id": appID, "app_token": subToken,
		"permissions": []any{"editor"}, "menusPermissions": []any{appID},
		"permissionBitfield": viewOnlyBitfield,
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	us := NewUserService(rm)
	user := us.mapSubUser(map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "editor@test.com",
		"app_token": subToken, "permissions": []any{"editor"}, "menusPermissions": []any{appID},
		"permissionBitfield": viewOnlyBitfield,
	})
	if user == nil {
		t.Fatal("expected mapped sub-user")
	}
	if !util.HasActionPermission(user.Permissions, "edit") {
		t.Fatalf("expected edit from editor preset merged over stale bitfield, got %v", user.Permissions)
	}
	if !util.HasActionPermission(user.Permissions, "create") {
		t.Fatalf("expected create from editor preset, got %v", user.Permissions)
	}
}
