package security

import (
	"testing"

	"csm_server/backend-go/internal/model"
)

func TestRefreshSessionValidForMiddlewareWithoutClientID(t *testing.T) {
	ip := "127.0.0.1"
	ua := "Mozilla/5.0 Test"
	clientID := "browser|tab1"
	expiry := int64(9999999999999)
	user := model.User{
		RefreshTokenIP:       &ip,
		RefreshTokenUA:       &ua,
		RefreshTokenClientID: &clientID,
		RefreshTokenExpiry:   &expiry,
	}
	if !RefreshSessionValidForMiddleware(user, ip, ua, "") {
		t.Fatal("expected refresh to succeed without X-Client-Id header (Java parity)")
	}
}

func TestRefreshSessionValidForMiddlewareRejectsWrongClientIDWhenSent(t *testing.T) {
	ip := "127.0.0.1"
	ua := "Mozilla/5.0 Test"
	saved := "browser|tab1"
	expiry := int64(9999999999999)
	user := model.User{
		RefreshTokenIP:       &ip,
		RefreshTokenUA:       &ua,
		RefreshTokenClientID: &saved,
		RefreshTokenExpiry:   &expiry,
	}
	if RefreshSessionValidForMiddleware(user, ip, ua, "browser|other") {
		t.Fatal("expected mismatch when caller sends wrong X-Client-Id")
	}
}
