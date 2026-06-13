package handlers

import (
	"encoding/json"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/services"
	"csm_server/backend-go/internal/util"
)

func userInfoMapFromUser(user *model.User) map[string]any {
	info := map[string]any{}
	copyIfSet(info, "userId", user.ID)
	copyIfSet(info, "username", user.Username)
	copyIfSet(info, "email", user.Email)
	copyIfSet(info, "phoneNumber", user.PhoneNumber)
	copyIfSet(info, "full_name", user.FullName)
	copyIfSet(info, "avatar", user.Avatar)
	copyIfSet(info, "app_token", user.AppToken)
	copyIfSet(info, "app_id", user.AppID)
	if len(user.Permissions) > 0 {
		info["roles"] = append([]string{}, user.Permissions...)
		info["permissions"] = append([]string{}, user.Permissions...)
	}
	if len(user.MenusPermissions) > 0 {
		info["menusPermissions"] = append([]string{}, user.MenusPermissions...)
	}
	if user.PermissionBitfield != nil {
		info["permissionBitfield"] = *user.PermissionBitfield
	}
	if user.PermissionSchemaVer != nil {
		info["permissionSchemaVersion"] = *user.PermissionSchemaVer
	}
	if user.DataScope != nil {
		info["dataScope"] = *user.DataScope
	}
	if user.DeptID != nil {
		info["dept_id"] = *user.DeptID
	}
	if user.BranchID != nil {
		info["branch_id"] = *user.BranchID
	}
	if len(user.DataAppIDs) > 0 {
		info["data_app_ids"] = append([]string{}, user.DataAppIDs...)
	}
	if user.Dev != nil {
		info["dev"] = *user.Dev
	}
	if len(user.UserAddress) > 0 {
		var addr any
		if err := json.Unmarshal(user.UserAddress, &addr); err == nil {
			info["user_address"] = addr
			info["user_adress"] = addr
		}
	}
	return info
}

func enrichAccountMeta(rm *data.RecordManager, user *model.User, info map[string]any) {
	token := ""
	if user.AppToken != nil {
		token = *user.AppToken
	}
	meta := util.ParseAppToken(rm, token)
	isSubUser := util.IsSubUserRole(meta.Role)
	info["account_type"] = "main"
	if isSubUser {
		info["account_type"] = "sub-user"
	}
	info["is_sub_user"] = isSubUser
	if meta.LoginIdentifier != "" {
		info["login_identifier"] = meta.LoginIdentifier
	}
}

func enrichUserInfoWithBitfield(info map[string]any) {
	storedBitfield, _ := info["permissionBitfield"].(string)

	basePermissions := stringListFromAny(info["permissions"])
	if len(basePermissions) == 0 {
		basePermissions = stringListFromAny(info["roles"])
	}
	baseMenus := stringListFromAny(info["menusPermissions"])

	dev := false
	if v, ok := info["dev"].(bool); ok {
		dev = v
	}

	permissions := util.MergeUniqueCaseInsensitive(
		basePermissions,
		util.PermissionsFromBitfield(storedBitfield),
	)
	menusPermissions := util.MergeUniqueCaseInsensitive(
		baseMenus,
		util.MenusFromBitfield(storedBitfield),
	)

	bitfield := util.BuildBitfield(permissions, menusPermissions, dev)

	info["roles"] = permissions
	info["permissions"] = permissions
	info["menusPermissions"] = menusPermissions
	info["permissionBitfield"] = util.ToCompactToken(bitfield)
	info["permissionSchemaVersion"] = util.SchemaV3
	info["dataScope"] = util.ResolveDataScope(bitfield)
}

func enrichBitfield(user *model.User, info map[string]any) {
	permissions := user.Permissions
	menus := user.MenusPermissions
	dev := user.Dev != nil && *user.Dev

	if _, ok := info["permissions"]; !ok && len(permissions) > 0 {
		info["permissions"] = append([]string{}, permissions...)
	}
	if _, ok := info["roles"]; !ok && len(permissions) > 0 {
		info["roles"] = append([]string{}, permissions...)
	}
	if _, ok := info["menusPermissions"]; !ok && len(menus) > 0 {
		info["menusPermissions"] = append([]string{}, menus...)
	}

	bitfield := util.BuildBitfield(permissions, menus, dev)
	info["permissionBitfield"] = util.ToCompactToken(bitfield)
	info["permissionSchemaVersion"] = util.SchemaV3
	info["dataScope"] = util.ResolveDataScope(bitfield)
}

func enrichAsyncRoutes(rm *data.RecordManager, user *model.User, result map[string]any) {
	index := rm.Find(services.CSMAppID, "index", model.EqFilter("id", "accessRights"))
	dataArr, ok := index["data"].([]any)
	if !ok {
		enrichBitfield(user, result)
		return
	}
	auth := security.AuthUser{
		Dev:              user.Dev != nil && *user.Dev,
		Permissions:      user.Permissions,
		MenusPermissions: user.MenusPermissions,
	}
	filtered := filterRoutesByRole(dataArr, &auth)
	result["asyncRoutes"] = filtered
	enrichBitfield(user, result)
}

func stringListFromAny(v any) []string {
	switch t := v.(type) {
	case []string:
		return append([]string{}, t...)
	case []any:
		out := make([]string, 0, len(t))
		for _, item := range t {
			if s, ok := item.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	case string:
		if t == "" {
			return nil
		}
		return []string{t}
	default:
		return nil
	}
}
