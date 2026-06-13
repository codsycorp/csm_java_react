package services

import (
	"sync"
	"time"

	"csm_server/backend-go/internal/model"
)

// Grace window for rotated refresh tokens so parallel in-flight requests still authenticate.
const refreshTokenGraceDuration = 2 * time.Minute

type refreshGraceEntry struct {
	until            time.Time
	appToken         string
	userID           string
	loginVersion     int
	refreshIP        string
	refreshUA        string
	refreshExpiry    int64
	refreshClientID  string
}

var refreshTokenGrace sync.Map // old refresh token -> refreshGraceEntry

func rememberRotatedRefreshToken(oldToken string, user *model.User) {
	if oldToken == "" || user == nil {
		return
	}
	entry := refreshGraceEntry{
		until:        time.Now().Add(refreshTokenGraceDuration),
		appToken:     deref(user.AppToken),
		userID:       deref(user.ID),
		loginVersion: derefInt(user.LoginVersion),
	}
	if user.RefreshTokenIP != nil {
		entry.refreshIP = *user.RefreshTokenIP
	}
	if user.RefreshTokenUA != nil {
		entry.refreshUA = *user.RefreshTokenUA
	}
	if user.RefreshTokenExpiry != nil {
		entry.refreshExpiry = *user.RefreshTokenExpiry
	}
	if user.RefreshTokenClientID != nil {
		entry.refreshClientID = *user.RefreshTokenClientID
	}
	refreshTokenGrace.Store(oldToken, entry)
}

func (e refreshGraceEntry) toUser() *model.User {
	u := &model.User{
		AppToken:     model.StrPtr(e.appToken),
		ID:           model.StrPtr(e.userID),
		LoginVersion: model.IntPtr(e.loginVersion),
	}
	if e.refreshIP != "" {
		u.RefreshTokenIP = model.StrPtr(e.refreshIP)
	}
	if e.refreshUA != "" {
		u.RefreshTokenUA = model.StrPtr(e.refreshUA)
	}
	if e.refreshExpiry > 0 {
		u.RefreshTokenExpiry = model.Int64Ptr(e.refreshExpiry)
	}
	if e.refreshClientID != "" {
		u.RefreshTokenClientID = model.StrPtr(e.refreshClientID)
	}
	return u
}

func (s *UserService) lookupRefreshGraceUser(refreshToken string) *model.User {
	raw, ok := refreshTokenGrace.Load(refreshToken)
	if !ok {
		return nil
	}
	entry, ok := raw.(refreshGraceEntry)
	if !ok || time.Now().After(entry.until) {
		refreshTokenGrace.Delete(refreshToken)
		return nil
	}
	if s.rm != nil {
		if entry.appToken != "" {
			if u := s.FindByAppTokenScoped(entry.appToken, entry.userID, entry.loginVersion); u != nil {
				return u
			}
			if u := s.FindByAppToken(entry.appToken); u != nil {
				return u
			}
		}
		if entry.userID != "" {
			if u := s.FindByID(entry.userID); u != nil {
				return u
			}
		}
	}
	return entry.toUser()
}
