package services

import (
	"os"
	"path/filepath"
	"testing"

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
