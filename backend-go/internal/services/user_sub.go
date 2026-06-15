package services

import (
	"encoding/json"
	"log"
	"strings"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/util"
)

// mapSubUser mirrors Java UserService.mapSubUserRecordToUser / Rust map_sub_user.
func (s *UserService) mapSubUser(record map[string]any) *model.User {
	parentKey, _ := record["parent_account_id"].(string)
	parentKey = strings.TrimSpace(parentKey)
	if parentKey == "" {
		return nil
	}
	parentRecord := s.findParentAccount(parentKey)
	if len(parentRecord) == 0 {
		return nil
	}

	record = s.ensureSubUserCanonicalFields(record, parentRecord)

	user := s.mapRecordToUser(parentRecord, false)
	t := true
	user.IsSubUser = &t
	devFalse := false
	user.Dev = &devFalse
	user.DataAppIDs = []string{}
	// Never inherit parent session principal — causes JWT uid/sub mismatch (401 on user-info).
	user.AppToken = nil

	if id, ok := record["id"].(string); ok && strings.TrimSpace(id) != "" {
		user.ID = &id
	}
	if login, ok := record["login_identifier"].(string); ok && strings.TrimSpace(login) != "" {
		user.Username = &login
		if user.Email == nil || strings.TrimSpace(*user.Email) == "" {
			user.Email = &login
		}
	}
	if email, ok := record["email"].(string); ok && strings.TrimSpace(email) != "" {
		user.Email = &email
	}
	if username, ok := record["username"].(string); ok && strings.TrimSpace(username) != "" {
		user.Username = &username
	}
	if phone, ok := record["phoneNumber"].(string); ok {
		user.PhoneNumber = &phone
	}
	if fullName, ok := record["full_name"].(string); ok && strings.TrimSpace(fullName) != "" {
		user.FullName = &fullName
	}
	if avatar, ok := record["avatar"].(string); ok {
		user.Avatar = &avatar
	}
	if pass, ok := record["pass"].(string); ok && pass != "" {
		user.Password = &pass
	}
	actived := recordActivedOrDefault(record, true)
	user.Actived = &actived

	if addr := userAddressFromRecord(record["user_address"]); len(addr) > 0 {
		user.UserAddress = addr
	}

	user.GroupRights = model.MapListFromRecord(record, "group_rights", "groupRights")
	if user.GroupRights == nil {
		user.GroupRights = []map[string]any{}
	}

	if refresh, ok := firstNonEmptyRecord(record, "refresh", "refresh_token"); ok {
		user.RefreshToken = &refresh
	}
	if ip, ok := record["refresh_token_ip"].(string); ok {
		user.RefreshTokenIP = &ip
	}
	if ua, ok := record["refresh_token_ua"].(string); ok {
		user.RefreshTokenUA = &ua
	}
	if lv, ok := modelIntFromRecord(record, "login_version", "loginVersion"); ok {
		user.LoginVersion = &lv
	} else {
		zero := 0
		user.LoginVersion = &zero
	}

	if scope, ok := firstNonEmptyRecord(record, "dataScope", "data_scope"); ok {
		user.DataScope = &scope
	}
	if dept, ok := record["dept_id"].(string); ok && dept != "" {
		user.DeptID = &dept
	}
	if branch, ok := record["branch_id"].(string); ok && branch != "" {
		user.BranchID = &branch
	}

	directPermissions := model.StringListFromRecord(record, "permissions")
	recordPermissions := append([]string{}, directPermissions...)
	directMenus := model.StringListFromRecord(record, "menusPermissions", "menus_permissions")
	recordMenus := append([]string{}, directMenus...)
	permissionsAdd := model.StringListFromRecord(record, "permissionsAdd")
	permissionsDeny := model.StringListFromRecord(record, "permissionsDeny")
	menusAdd := model.StringListFromRecord(record, "menusPermissionsAdd", "menus_permissions_add")
	menusDeny := model.StringListFromRecord(record, "menusPermissionsDeny", "menus_permissions_deny")

	if subToken, ok := record["app_token"].(string); ok && strings.TrimSpace(subToken) != "" {
		user.AppToken = &subToken
		meta := util.ParseAppToken(s.rm, subToken)
		if meta.AppID != "" {
			user.AppID = &meta.AppID
		}
	} else if token := s.ensureSubUserAppToken(record, parentRecord); token != "" {
		user.AppToken = &token
		meta := util.ParseAppToken(s.rm, token)
		if meta.AppID != "" {
			user.AppID = &meta.AppID
		}
	}

	groupID, _ := firstNonEmptyRecord(record, "group_id", "groupId", "role_id", "role_code")
	groupID = strings.TrimSpace(groupID)
	roleLookupAppID := deref(user.AppID)
	if roleLookupAppID == "" {
		if appID, ok := record["app_id"].(string); ok {
			roleLookupAppID = strings.TrimSpace(appID)
		}
	}
	if roleLookupAppID == "" {
		if appID, ok := parentRecord["app_id"].(string); ok {
			roleLookupAppID = strings.TrimSpace(appID)
		}
	}

	hasAuthoritativeRole := false
	var roleBitfield string
	if groupID != "" {
		roleLookupCandidates := make([]string, 0, 4)
		appendRoleLookupApp := func(appID string) {
			appID = strings.TrimSpace(appID)
			if appID == "" {
				return
			}
			for _, existing := range roleLookupCandidates {
				if strings.EqualFold(existing, appID) {
					return
				}
			}
			roleLookupCandidates = append(roleLookupCandidates, appID)
		}
		appendRoleLookupApp(roleLookupAppID)
		if appID, ok := record["app_id"].(string); ok {
			appendRoleLookupApp(appID)
		}
		if appID, ok := parentRecord["app_id"].(string); ok {
			appendRoleLookupApp(appID)
		}
		appendRoleLookupApp(CSMAppID)
		parentMenus := model.StringListFromRecord(parentRecord, "menusPermissions", "menus_permissions")
		menuCandidates := util.MergeUniqueCaseInsensitive(
			util.MergeUniqueCaseInsensitive(directMenus, recordMenus),
			parentMenus,
		)
		for _, menu := range menuCandidates {
			menu = strings.TrimSpace(menu)
			if menu == "" {
				continue
			}
			if strings.HasPrefix(strings.ToLower(menu), "broadcast_") {
				appendRoleLookupApp(strings.TrimPrefix(menu, "broadcast_"))
				appendRoleLookupApp(strings.TrimPrefix(strings.ToLower(menu), "broadcast_"))
			}
			if strings.HasPrefix(strings.ToLower(menu), "app:") {
				appendRoleLookupApp(strings.TrimPrefix(menu, "app:"))
				appendRoleLookupApp(strings.TrimPrefix(strings.ToLower(menu), "app:"))
			}
			appendRoleLookupApp(menu)
		}
		for _, dataApp := range model.StringListFromRecord(parentRecord, "data_app_ids", "dataAppIds") {
			appendRoleLookupApp(dataApp)
		}

		var roleRecord map[string]any
		for _, lookupAppID := range roleLookupCandidates {
			if rec := s.findRoleByCode(lookupAppID, groupID); len(rec) > 0 {
				roleRecord = rec
				break
			}
		}
		if len(roleRecord) > 0 {
			hasAuthoritativeRole = true
			if raw, ok := firstNonEmptyRecord(roleRecord, "permissionBitfield", "permission_bitfield"); ok {
				roleBitfield = raw
			}
			rolePerms := model.StringListFromRecord(roleRecord, "permissions")
			if len(rolePerms) > 0 {
				directPermissions = util.MergeUniqueCaseInsensitive(recordPermissions, rolePerms)
			} else if roleBitfield != "" {
				directPermissions = util.MergeUniqueCaseInsensitive(
					recordPermissions,
					util.PermissionsFromBitfield(roleBitfield),
				)
			}
			roleMenus := model.StringListFromRecord(roleRecord, "menusPermissions", "menus_permissions")
			if len(roleMenus) > 0 {
				directMenus = util.MergeUniqueCaseInsensitive(recordMenus, roleMenus)
			} else if roleBitfield != "" {
				directMenus = util.MergeUniqueCaseInsensitive(recordMenus, util.MenusFromBitfield(roleBitfield))
			}
		}
		if (len(directMenus) == 0 || len(directPermissions) == 0) && !hasAuthoritativeRole {
			if group := findGroupRight(record, parentRecord, groupID); group != nil {
				if perms := model.StringListFromRecord(group, "permissions"); len(perms) > 0 {
					directPermissions = perms
				}
				if menus := model.StringListFromRecord(group, "menusPermissions", "menus_permissions"); len(menus) > 0 {
					directMenus = menus
				}
			}
		}
	}

	bitfieldFromRecord, _ := firstNonEmptyRecord(record, "permissionBitfield", "permission_bitfield")
	if hasAuthoritativeRole && roleBitfield != "" && len(directPermissions) == 0 && len(directMenus) == 0 {
		bitfieldFromRecord = roleBitfield
	}

	var effectivePermissions, effectiveMenus []string
	if hasAuthoritativeRole && len(directPermissions) > 0 {
		// Role permissions beat stale sub-user permissionBitfield snapshots.
		effectivePermissions = append([]string{}, directPermissions...)
		if len(directMenus) > 0 {
			effectiveMenus = append([]string{}, directMenus...)
		} else if roleBitfield != "" {
			effectiveMenus = util.MenusFromBitfield(roleBitfield)
		} else if bitfieldFromRecord != "" {
			effectiveMenus = util.MenusFromBitfield(bitfieldFromRecord)
		}
	} else if bitfieldFromRecord != "" {
		effectivePermissions = util.PermissionsFromBitfield(bitfieldFromRecord)
		effectiveMenus = util.MenusFromBitfield(bitfieldFromRecord)
		if len(directPermissions) > 0 {
			effectivePermissions = util.MergeUniqueCaseInsensitive(
				effectivePermissions,
				util.ExpandPermissionPresets(directPermissions),
			)
		}
		if len(directMenus) > 0 {
			effectiveMenus = util.MergeUniqueCaseInsensitive(effectiveMenus, directMenus)
		}
	} else {
		effectivePermissions = append([]string{}, directPermissions...)
		effectiveMenus = append([]string{}, directMenus...)
	}

	effectivePermissions = util.MergeUniqueCaseInsensitive(effectivePermissions, permissionsAdd)
	effectivePermissions = util.SubtractCaseInsensitive(effectivePermissions, permissionsDeny)
	effectiveMenus = util.MergeUniqueCaseInsensitive(effectiveMenus, menusAdd)
	effectiveMenus = util.SubtractCaseInsensitive(effectiveMenus, menusDeny)
	effectivePermissions = util.ExpandPermissionPresets(effectivePermissions)

	if len(effectivePermissions) == 0 && len(directPermissions) > 0 {
		effectivePermissions = append([]string{}, directPermissions...)
	}
	if len(effectiveMenus) == 0 && len(directMenus) > 0 {
		effectiveMenus = append([]string{}, directMenus...)
	}

	effectivePermissions = util.SubtractCaseInsensitive(effectivePermissions, []string{"admin", "dev"})
	if !util.HasAnyActionPermission(effectivePermissions) {
		effectivePermissions = util.MergeUniqueCaseInsensitive(effectivePermissions, []string{"view"})
	}
	if len(effectivePermissions) == 0 {
		effectivePermissions = []string{"view", "scope:owner"}
	}

	user.Permissions = effectivePermissions
	user.MenusPermissions = effectiveMenus

	bitfield := util.BuildBitfield(effectivePermissions, effectiveMenus, false)
	token := util.ToCompactToken(bitfield)
	user.PermissionBitfield = &token
	schema := util.SchemaV3
	user.PermissionSchemaVer = &schema
	dataScope := util.ResolveDataScope(bitfield)
	user.DataScope = &dataScope

	return &user
}

// ensureSubUserCanonicalFields mirrors Java UserService.ensureSubUserCanonicalFields.
func (s *UserService) ensureSubUserCanonicalFields(record, parentRecord map[string]any) map[string]any {
	if len(record) == 0 {
		return record
	}
	changed := false
	loginID := strings.TrimSpace(derefStr(record["login_identifier"]))
	appToken := strings.TrimSpace(derefStr(record["app_token"]))

	setBlankString := func(key, value string) {
		if !recordHasNonBlankString(record, key) {
			record[key] = value
			changed = true
		}
	}
	setMissing := func(key string, value any) {
		if _, ok := record[key]; !ok {
			record[key] = value
			changed = true
		}
	}

	setBlankString("username", loginID)
	setBlankString("email", loginID)
	setMissing("phoneNumber", "")
	setBlankString("full_name", loginID)
	setMissing("user_address", "")
	setMissing("avatar", "")
	setMissing("group_rights", []any{})

	refreshToken := strings.TrimSpace(derefStr(record["refresh_token"]))
	refresh := strings.TrimSpace(derefStr(record["refresh"]))
	if refreshToken == "" {
		if refresh != "" {
			record["refresh_token"] = refresh
			changed = true
		} else if appToken != "" {
			record["refresh_token"] = appToken
			changed = true
		}
	}
	if refresh == "" {
		normalizedRefresh := strings.TrimSpace(derefStr(record["refresh_token"]))
		if normalizedRefresh != "" {
			record["refresh"] = normalizedRefresh
			changed = true
		} else if appToken != "" {
			record["refresh"] = appToken
			changed = true
		}
	}
	setMissing("refresh_token_ip", "")
	setMissing("refresh_token_ua", "")
	setMissing("refresh_token_expiry", int64(0))

	if _, ok := record["login_version"]; !ok {
		if legacy, ok := modelIntFromRecord(record, "loginVersion"); ok {
			record["login_version"] = legacy
		} else {
			record["login_version"] = 0
		}
		changed = true
	}
	if _, ok := record["loginVersion"]; !ok {
		if lv, ok := modelIntFromRecord(record, "login_version"); ok {
			record["loginVersion"] = lv
		} else {
			record["loginVersion"] = 0
		}
		changed = true
	}

	if _, ok := record["source_app_token"]; !ok {
		if parentToken, ok := firstNonEmptyRecord(parentRecord, "app_token"); ok {
			record["source_app_token"] = parentToken
			changed = true
		}
	}
	if !recordHasNonBlankString(record, "app_id") {
		if parentAppID := strings.TrimSpace(derefStr(parentRecord["app_id"])); parentAppID != "" {
			record["app_id"] = parentAppID
			changed = true
		}
	}

	if changed {
		if _, err := s.rm.CreateRecord(CSMAppID, SubAccountsTable, record, []string{"id", "login_identifier"}); err != nil {
			log.Printf("ensureSubUserCanonicalFields: persist failed for %s: %v", loginID, err)
		}
	}
	return record
}

func recordHasNonBlankString(record map[string]any, key string) bool {
	if record == nil {
		return false
	}
	v, ok := record[key].(string)
	return ok && strings.TrimSpace(v) != ""
}

func userAddressFromRecord(value any) json.RawMessage {
	switch v := value.(type) {
	case nil:
		return nil
	case json.RawMessage:
		if len(v) == 0 {
			return nil
		}
		return v
	case string:
		text := strings.TrimSpace(v)
		if text == "" {
			return nil
		}
		return json.RawMessage(text)
	default:
		raw, err := json.Marshal(v)
		if err != nil {
			return nil
		}
		return json.RawMessage(raw)
	}
}

func (s *UserService) ensureSubUserAppToken(record, parentRecord map[string]any) string {
	if token, ok := firstNonEmptyRecord(record, "app_token"); ok {
		return token
	}
	loginID, _ := firstNonEmptyRecord(record, "login_identifier", "username", "email")
	if loginID == "" {
		return ""
	}
	appID := strings.TrimSpace(derefStr(record["app_id"]))
	if appID == "" {
		appID = strings.TrimSpace(derefStr(parentRecord["app_id"]))
	}
	if appID == "" && parentRecord != nil {
		if parentToken, ok := firstNonEmptyRecord(parentRecord, "app_token"); ok {
			appID = util.ParseAppToken(s.rm, parentToken).AppID
		}
	}
	if appID == "" {
		appID = CSMAppID
	}
	raw := util.BuildRawToken(appID, loginID, "user", util.ResolveAccessRight("user"))
	token := s.rm.CsmEncrypt(raw)
	record["app_token"] = token
	if parentToken, ok := firstNonEmptyRecord(parentRecord, "app_token"); ok {
		record["source_app_token"] = parentToken
	}
	record["app_id"] = appID
	if _, err := s.rm.CreateRecord(CSMAppID, SubAccountsTable, record, []string{"id", "login_identifier"}); err != nil {
		log.Printf("ensureSubUserAppToken: persist failed for %s: %v", loginID, err)
	}
	return token
}

func derefStr(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func (s *UserService) findParentAccount(parentKey string) map[string]any {
	parentKey = strings.TrimSpace(parentKey)
	if parentKey == "" {
		return nil
	}
	for _, field := range []string{"id", "app_id", "email", "username", "phoneNumber"} {
		if rec := s.rm.Find(CSMAppID, AccountsTable, model.EqFilter(field, parentKey)); len(rec) > 0 {
			return rec
		}
	}
	return nil
}

func (s *UserService) findRoleByCode(appID, roleCode string) map[string]any {
	roleCode = strings.TrimSpace(roleCode)
	if roleCode == "" {
		return nil
	}
	effectiveAppID := strings.TrimSpace(appID)
	if effectiveAppID == "" {
		effectiveAppID = CSMAppID
	}
	for _, field := range []string{"role_code", "id"} {
		if rec := s.rm.Find(effectiveAppID, "csm_roles", model.EqFilter(field, roleCode)); len(rec) > 0 {
			return rec
		}
	}
	return nil
}

func findGroupRight(subRecord, parentRecord map[string]any, groupID string) map[string]any {
	if group := findGroupRightInRecord(subRecord, groupID); group != nil {
		return group
	}
	return findGroupRightInRecord(parentRecord, groupID)
}

func findGroupRightInRecord(record map[string]any, groupID string) map[string]any {
	raw, ok := record["group_rights"]
	if !ok || groupID == "" {
		return nil
	}
	switch groups := raw.(type) {
	case []any:
		for _, item := range groups {
			group, ok := item.(map[string]any)
			if !ok {
				continue
			}
			gid, _ := group["group_id"].(string)
			if gid == groupID {
				return group
			}
		}
	case []map[string]any:
		for _, group := range groups {
			gid, _ := group["group_id"].(string)
			if gid == groupID {
				return group
			}
		}
	}
	return nil
}

func (s *UserService) findSubUserByAppToken(appToken string) map[string]any {
	if appToken == "" {
		return nil
	}
	if rec := s.rm.FindByCustomPK(CSMAppID, SubAccountsTable, map[string]any{"app_token": appToken}, []string{"app_token"}); len(rec) > 0 {
		return rec
	}
	return s.rm.Find(CSMAppID, SubAccountsTable, model.EqFilter("app_token", appToken))
}

func firstNonEmptyRecord(record map[string]any, keys ...string) (string, bool) {
	for _, key := range keys {
		if v, ok := record[key].(string); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v), true
		}
	}
	return "", false
}

func modelIntFromRecord(record map[string]any, keys ...string) (int, bool) {
	for _, key := range keys {
		if v, ok := model.IntFromAny(record[key]); ok {
			return v, true
		}
	}
	return 0, false
}
