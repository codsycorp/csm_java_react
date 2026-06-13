package security

import (
	"testing"

	"csm_server/backend-go/internal/model"
)

func TestRefreshTokenExpiredZeroMeansUnset(t *testing.T) {
	zero := int64(0)
	user := model.User{RefreshTokenExpiry: &zero}
	if RefreshTokenExpired(user) {
		t.Fatal("expiry 0 must not be treated as expired (Java parity for sub-users)")
	}
}

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
