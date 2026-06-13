package services

import (
	"testing"
	"time"

	"csm_server/backend-go/internal/model"
)

func TestRefreshTokenGraceAcceptsRecentlyRotatedToken(t *testing.T) {
	appToken := "grace-test-app-token"
	userID := "grace-test-user-id"
	user := &model.User{
		ID:           model.StrPtr(userID),
		AppToken:     model.StrPtr(appToken),
		LoginVersion: model.IntPtr(3),
		RefreshToken: model.StrPtr("new-refresh-token"),
	}

	oldToken := "old-refresh-token-before-rotation"
	rememberRotatedRefreshToken(oldToken, user)

	us := &UserService{}
	found := us.lookupRefreshGraceUser(oldToken)
	if found == nil {
		t.Fatal("expected grace lookup to return user")
	}
	if deref(found.AppToken) != appToken {
		t.Fatalf("unexpected app_token: %s", deref(found.AppToken))
	}

	refreshTokenGrace.Store(oldToken, refreshGraceEntry{
		until:        time.Now().Add(-time.Second),
		appToken:     appToken,
		userID:       userID,
		loginVersion: 3,
	})
	if us.lookupRefreshGraceUser(oldToken) != nil {
		t.Fatal("expected expired grace entry to be rejected")
	}
}

func TestFindUserByRefreshTokenUsesGraceWhenDBMisses(t *testing.T) {
	oldToken := "grace-only-token"
	user := &model.User{
		ID:           model.StrPtr("u1"),
		AppToken:     model.StrPtr("at1"),
		LoginVersion: model.IntPtr(1),
	}
	rememberRotatedRefreshToken(oldToken, user)

	us := &UserService{}
	found := us.FindUserByRefreshToken(oldToken, false)
	if found == nil {
		t.Fatal("FindUserByRefreshToken should resolve via grace map")
	}
}
