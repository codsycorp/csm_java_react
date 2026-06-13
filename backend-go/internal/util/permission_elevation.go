package util

import "strings"

func ApplyDevPermissionElevation(permissions, menusPermissions *[]string, appID string) {
	*permissions = MergeUniqueCaseInsensitive(*permissions, []string{"dev", "admin", "scope:all"})
	appID = strings.TrimSpace(appID)
	if appID != "" {
		*menusPermissions = []string{appID}
	}
}

func ApplyMainAccountPermissionElevation(permissions, menusPermissions *[]string, appID string) {
	*permissions = MergeUniqueCaseInsensitive(*permissions, []string{
		"admin", "scope:all", "view", "create", "edit", "delete", "export",
	})
	if len(*menusPermissions) == 0 {
		appID = strings.TrimSpace(appID)
		if appID != "" {
			*menusPermissions = []string{appID}
		}
	}
}
