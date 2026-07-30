package services

import (
	"os"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/util"
)

func newTempRecordManager(t *testing.T) *data.RecordManager {
	t.Helper()
	dir := t.TempDir()
	os.Setenv("APP_DATA_DIR", dir)
	cfg := config.LoadFromEnv()
	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("open temp pebble: %v", err)
	}
	t.Cleanup(rm.ShutdownAll)
	return rm
}

func TestRecordActivedOrDefaultJavaParity(t *testing.T) {
	if recordActivedOrDefault(map[string]any{}, false) {
		t.Fatal("main account missing actived should default false")
	}
	if !recordActivedOrDefault(map[string]any{}, true) {
		t.Fatal("sub-user missing actived should default true")
	}
	if !recordActivedOrDefault(map[string]any{"actived": true}, false) {
		t.Fatal("explicit actived=true must win")
	}
	if recordActivedOrDefault(map[string]any{"actived": false}, true) {
		t.Fatal("explicit actived=false must win")
	}
}

func TestPasswordMatchesMainAccountInactiveByDefault(t *testing.T) {
	rm := &data.RecordManager{}
	us := NewUserService(rm)
	pass := rm.CsmEncrypt("staff@test.com_____secret")
	record := map[string]any{
		"pass":     pass,
		"username": "staff@test.com",
	}
	user := model.User{Username: model.StrPtr("staff@test.com"), Password: &pass}
	if us.passwordMatches(record, user, "staff@test.com", "secret") {
		t.Fatal("main account without actived field must not login (Java default false)")
	}
	record["actived"] = true
	if !us.passwordMatches(record, user, "staff@test.com", "secret") {
		t.Fatal("main account with actived=true should login")
	}
}

func TestFindGroupRightPrefersSubRecord(t *testing.T) {
	sub := map[string]any{
		"group_rights": []any{
			map[string]any{
				"group_id":    "role-a",
				"permissions": []any{"edit"},
			},
		},
	}
	parent := map[string]any{
		"group_rights": []any{
			map[string]any{
				"group_id":    "role-a",
				"permissions": []any{"view"},
			},
		},
	}
	group := findGroupRight(sub, parent, "role-a")
	if group == nil {
		t.Fatal("expected group")
	}
	perms := model.StringListFromRecord(group, "permissions")
	if len(perms) != 1 || perms[0] != "edit" {
		t.Fatalf("expected sub-user group_rights to win, got %v", perms)
	}
}

func TestMapSubUserCopiesGroupRightsAndAddress(t *testing.T) {
	rm := newTempRecordManager(t)
	parentID := "parent-parity"
	appID := "demo-parity"
	parentToken := rm.CsmEncrypt(appID + "_____owner@test.com_____admin_____0")
	_, err := rm.CreateRecord(CSMAppID, AccountsTable, map[string]any{
		"id": parentID, "email": "owner@test.com", "username": "owner@test.com",
		"app_id": appID, "app_token": parentToken, "permissions": []any{"admin"}, "actived": true,
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	subID := "sub-parity"
	_, err = rm.CreateRecord(CSMAppID, SubAccountsTable, map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "child@test.com",
		"permissions": []any{"view"},
		"group_rights": []any{
			map[string]any{"group_id": "g1", "permissions": []any{"view"}},
		},
		"user_address": "123 Main St",
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	us := NewUserService(rm)
	user := us.mapSubUser(map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "child@test.com",
		"permissions": []any{"view"},
		"group_rights": []any{
			map[string]any{"group_id": "g1", "permissions": []any{"view"}},
		},
		"user_address": "123 Main St",
	})
	if user == nil {
		t.Fatal("expected mapped sub-user")
	}
	if len(user.GroupRights) != 1 {
		t.Fatalf("expected sub group_rights copied, got %#v", user.GroupRights)
	}
	if string(user.UserAddress) != `"123 Main St"` && string(user.UserAddress) != "123 Main St" {
		t.Fatalf("expected user_address copied, got %q", string(user.UserAddress))
	}
	if user.Actived == nil || !*user.Actived {
		t.Fatal("sub-user missing actived should default true")
	}
	if user.Username == nil || *user.Username == "" {
		t.Fatal("ensureSubUserCanonicalFields should populate username")
	}
}

func TestMapRecordToUserMainAccountKeepsMainSemanticsWithLegacyUserRoleToken(t *testing.T) {
	rm := newTempRecordManager(t)
	us := NewUserService(rm)
	record := map[string]any{
		"id":        "main-legacy-role-user",
		"email":     "owner@test.com",
		"username":  "owner@test.com",
		"actived":   true,
		"app_token": util.BuildRawToken("lmkt", "owner@test.com", "user", util.ResolveAccessRight("user")),
	}
	user := us.mapRecordToUser(record, true)
	if user.IsSubUser == nil || *user.IsSubUser {
		t.Fatal("main account must not be marked as sub-user")
	}
	if !util.HasActionPermission(user.Permissions, "admin") {
		t.Fatalf("main account should get admin permission elevation, got %v", user.Permissions)
	}
}
