package security

import (
	"strings"

	"csm_server/backend-go/internal/model"
)

type AuthUser struct {
	UserID              string
	Username            string
	Email               string
	PhoneNumber         string
	AppToken            string
	LoginVersion        int
	Permissions         []string
	MenusPermissions    []string
	PermissionBitfield  string
	DataScope           string
	Dev                 bool
	IsSubUser           bool
	AppID               string
	DataAppIDs          []string
	DeptID              string
	BranchID            string
	SessionFresh        bool // set by auth middleware when user was resolved from JWT this request
}

func AuthUserFromUser(user model.User, isSubUserHint bool) AuthUser {
	perms := user.Permissions
	if perms == nil {
		perms = []string{}
	}
	isSubUser := false
	if user.IsSubUser != nil {
		isSubUser = *user.IsSubUser
	} else {
		isSubUser = isSubUserHint
	}
	isDev := false
	if !isSubUser && user.Dev != nil {
		isDev = *user.Dev
	}
	dataAppIDs := user.DataAppIDs
	if isSubUser {
		dataAppIDs = nil
	}
	return AuthUser{
		UserID:             deref(user.ID),
		Username:           deref(user.Username),
		Email:              deref(user.Email),
		PhoneNumber:        deref(user.PhoneNumber),
		AppToken:           deref(user.AppToken),
		LoginVersion:       derefInt(user.LoginVersion),
		Permissions:        perms,
		MenusPermissions:   user.MenusPermissions,
		PermissionBitfield: deref(user.PermissionBitfield),
		DataScope:          deref(user.DataScope),
		Dev:                isDev,
		IsSubUser:          isSubUser,
		AppID:              deref(user.AppID),
		DataAppIDs:         dataAppIDs,
		DeptID:             deref(user.DeptID),
		BranchID:           deref(user.BranchID),
	}
}

func (a AuthUser) CanAccessAppData(targetAppID string) bool {
	target := strings.TrimSpace(targetAppID)
	if target == "" {
		return true
	}
	if a.Dev {
		return true
	}
	if strings.EqualFold(a.AppID, "csm") {
		return true
	}
	if strings.EqualFold(a.AppID, target) {
		return true
	}
	for _, id := range a.DataAppIDs {
		if strings.EqualFold(id, target) {
			return true
		}
	}
	return false
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func derefInt(i *int) int {
	if i == nil {
		return 0
	}
	return *i
}
