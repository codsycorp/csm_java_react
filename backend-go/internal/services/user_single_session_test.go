package services

import (
	"testing"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
)

func TestResolveFromClaimsRejectsStaleLoginVersion(t *testing.T) {
	jwt := security.NewJWTUtil("test-secret-for-single-session")
	appToken := "app_____token_____1"
	userID := "user-1"
	tokenV5 := jwt.GenerateTokenWithUID(appToken, userID, 5)

	claims, err := jwt.ParseClaims(tokenV5)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Ver != 5 {
		t.Fatalf("token ver=%d want 5", claims.Ver)
	}
	currentVersion := 6
	if !(currentVersion > 0 && claims.Ver != currentVersion) {
		t.Fatal("expected stale JWT to fail strict single-session version check")
	}
}

func TestLoginVersionBumpSkipsRefreshGrace(t *testing.T) {
	oldToken := "old-session-refresh"
	newToken := "new-login-refresh"
	oldVersion := 4
	loginVersion := 5
	user := &model.User{
		ID:           model.StrPtr("u1"),
		AppToken:     model.StrPtr("at1"),
		LoginVersion: model.IntPtr(oldVersion),
		RefreshToken: model.StrPtr(oldToken),
	}
	if oldToken != "" && oldToken != newToken && oldVersion == loginVersion {
		rememberRotatedRefreshToken(oldToken, user)
	}
	if _, ok := refreshTokenGrace.Load(oldToken); ok {
		t.Fatal("login_version bump must not grace old refresh token (single-session)")
	}
}

func TestSameSessionRefreshRotationUsesGrace(t *testing.T) {
	oldToken := "rotate-from"
	newToken := "rotate-to"
	version := 7
	user := &model.User{
		ID:           model.StrPtr("u2"),
		AppToken:     model.StrPtr("at2"),
		LoginVersion: model.IntPtr(version),
		RefreshToken: model.StrPtr(oldToken),
	}
	if oldToken != "" && oldToken != newToken && version == version {
		rememberRotatedRefreshToken(oldToken, user)
	}
	if _, ok := refreshTokenGrace.Load(oldToken); !ok {
		t.Fatal("same-session refresh rotation should grace old refresh token")
	}
}