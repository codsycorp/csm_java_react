package security

import (
	"strings"

	"csm_server/backend-go/internal/model"
)

func UserMatchesCSMToken(jwt *JWTUtil, token string, user model.User) bool {
	claims, err := jwt.ParseClaimsAllowExpired(token)
	if err != nil {
		return false
	}
	return UserMatchesJWTHints(user, claims.UID, claims.Sub)
}

func UserMatchesJWTHints(user model.User, tokenUID, subject string) bool {
	if tokenUID != "" && user.ID != nil && !userIDsMatch(*user.ID, tokenUID) {
		return false
	}
	if subject != "" && !subjectMatchesUser(subject, user) {
		return false
	}
	return true
}

func subjectMatchesUser(subject string, user model.User) bool {
	if user.AppToken != nil && *user.AppToken == subject {
		return true
	}
	if user.ID != nil && *user.ID == subject {
		return true
	}
	if user.Email != nil && strings.EqualFold(*user.Email, subject) {
		return true
	}
	if user.Username != nil && strings.EqualFold(*user.Username, subject) {
		return true
	}
	if user.PhoneNumber != nil && *user.PhoneNumber == subject {
		return true
	}
	return false
}

func userIDsMatch(a, b string) bool {
	return strings.TrimSpace(a) == strings.TrimSpace(b)
}
