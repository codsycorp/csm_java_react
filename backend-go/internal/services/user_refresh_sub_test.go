package services

import (
	"testing"
)

func TestFindUserByRefreshTokenSubUserExpiryZero(t *testing.T) {
	rm := testRecordManager(t)
	parentID := "parent-refresh"
	appID := "demo-refresh"
	parentToken := rm.CsmEncrypt(appID + "_____admin@test.com_____admin_____0")
	_, err := rm.CreateRecord(CSMAppID, AccountsTable, map[string]any{
		"id": parentID, "email": "admin@test.com", "username": "admin@test.com",
		"app_id": appID, "app_token": parentToken,
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	subToken := rm.CsmEncrypt(appID + "_____staff@test.com_____user_____0")
	refresh := "sub-refresh-token-abc"
	subID := "sub-refresh"
	_, err = rm.CreateRecord(CSMAppID, SubAccountsTable, map[string]any{
		"id": subID, "parent_account_id": parentID, "login_identifier": "staff@test.com",
		"app_id": appID, "app_token": subToken,
		"refresh_token": refresh, "refresh": refresh,
		"refresh_token_expiry": int64(0),
	}, []string{"id"})
	if err != nil {
		t.Fatal(err)
	}

	us := NewUserService(rm)
	user := us.FindUserByRefreshToken(refresh, false)
	if user == nil {
		t.Fatal("expected sub-user refresh lookup with expiry=0")
	}
	if user.ID == nil || *user.ID != subID {
		t.Fatalf("expected sub id %s, got %v", subID, user.ID)
	}
}
