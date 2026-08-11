package handlers

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"csm_server/backend-go/internal/cacheepoch"
	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/services"
	"csm_server/backend-go/internal/util"
)

var reservedIndexIDs = map[string]struct{}{
	"menu": {}, "menuList": {}, "menuR": {}, "roleList": {}, "accessRights": {}, "menu_permissions": {},
}

type TableHandler struct {
	cfg    config.AppConfig
	rm     *data.RecordManager
	us     *services.UserService
	socket SocketBroadcaster
}

// SocketBroadcaster pushes realtime table updates to connected clients.
type SocketBroadcaster interface {
	EmitUpdateNotification(rm *data.RecordManager, appID, table, action string, row map[string]any)
}

func NewTableHandler(cfg config.AppConfig, rm *data.RecordManager, us *services.UserService, socket SocketBroadcaster) *TableHandler {
	return &TableHandler{cfg: cfg, rm: rm, us: us, socket: socket}
}

func (h *TableHandler) HandleGetTableData(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	result := h.handleTableOperation(params, false, auth)
	resp := model.NewResponse()
	success, _ := result["success"].(bool)
	code := 200
	if !success {
		code = 400
	}
	resp.Set("code", code)
	resp.Set("success", success)
	if msg, ok := result["message"].(string); ok {
		resp.Set("message", msg)
	} else if success {
		resp.Set("message", "ok")
	} else {
		resp.Set("message", "error")
	}
	if !success {
		return resp
	}
	table, _ := params["obj_name"].(string)
	filter := parseSearchFilter(params)
	appID := security.ResolveRequestAppIDNormalized(params, auth, h.rm)
	if table == "index" {
		appID = security.ResolveMenuIndexAppID(params, auth, filter)
		if normalized := security.NormalizePlainAppID(appID, h.rm); normalized != "" {
			appID = normalized
		}
	}
	if table != "" {
		resp.Set("id", table)
	}
	if rows, ok := result["rows"]; ok {
		resp.Set("rows", rows)
	}
	if cursor, ok := result["nextCursor"]; ok {
		resp.Set("nextCursor", cursor)
	}
	structRec := h.rm.FindIndexTableCached(appID, table)
	if structMap, ok := structRec["struct"].(map[string]any); ok {
		if pk, ok := structMap["fieldsPK"]; ok {
			resp.Set("fieldsPK", pk)
		}
		if fields, ok := structMap["fields"]; ok {
			resp.Set("fields", fields)
		}
	}
	return resp
}

func (h *TableHandler) HandleUpdateTableData(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	result := h.handleTableOperation(params, true, auth)
	resp := model.NewResponse()
	success, _ := result["success"].(bool)
	code := 200
	if !success {
		code = 400
	}
	resp.Set("code", code)
	resp.Set("success", success)
	if msg, ok := result["message"].(string); ok {
		resp.Set("message", msg)
	} else if success {
		resp.Set("message", "ok")
	} else {
		resp.Set("message", "error")
	}
	for _, key := range []string{"command", "socket_actions", "updated_row", "obj_name", "app_id"} {
		if v, ok := result[key]; ok {
			resp.Set(key, v)
		}
	}
	if _, ok := result["obj_name"]; !ok {
		if v, ok := params["obj_name"]; ok {
			resp.Set("obj_name", v)
		}
	}
	if _, ok := result["app_id"]; !ok {
		if v, ok := params["app_id"]; ok {
			resp.Set("app_id", v)
		}
	}
	return resp
}

func (h *TableHandler) handleTableOperation(params map[string]any, isUpdate bool, auth *security.AuthUser) map[string]any {
	out := map[string]any{}
	table, _ := params["obj_name"].(string)
	filter := parseSearchFilter(params)
	appID := security.ResolveRequestAppIDNormalized(params, auth, h.rm)
	if table == "index" && !isUpdate {
		appID = security.ResolveMenuIndexAppID(params, auth, filter)
	}
	access := h.resolveAccess(auth)

	table, filter = security.ResolveSystemUserTableForRead(table, isUpdate, params, filter, access)
	if table == "csm_group_members" {
		// csm_group_members is a system table stored under csm app namespace.
		appID = "csm"
	}

	onlyMySubusers, _ := params["only_my_subusers"].(bool)
	filter = security.MergeOnlyMySubusersFilter(table, isUpdate, onlyMySubusers, filter, access)

	allowScopedAutosetup := security.IsAllowedAutosetupTemplateRead(appID, table, isUpdate, filter, access)
	if !allowScopedAutosetup {
		if msg := security.ValidateActionPermissionForTable(access, security.ResolveRequiredAction(params, isUpdate), appID, table, h.rm); msg != "" {
			out["success"] = false
			out["message"] = msg
			return out
		}
	}
	if msg := security.ValidateSystemUserTableAccess(table, isUpdate, params, filter, access); msg != "" {
		out["success"] = false
		out["message"] = msg
		return out
	}
	if msg := security.ValidatePermissionGroupAppBoundary(appID, table, access); msg != "" {
		out["success"] = false
		out["message"] = msg
		return out
	}
	if _, reserved := reservedIndexIDs[table]; reserved {
		out["success"] = false
		out["message"] = "Table name '" + table + "' is reserved"
		return out
	}

	if table == "index" {
		return h.handleIndexTableOperation(out, params, appID, filter, isUpdate, access)
	}

	if !strings.HasPrefix(table, "csm_") && !strings.HasPrefix(table, "sys_") {
		if access != nil && !access.IsDev && !access.CanAccessAppData(appID) {
			action := "read"
			if isUpdate {
				action = "write"
			}
			out["success"] = false
			out["message"] = "Bạn không có quyền " + action + " dữ liệu của ứng dụng '" + appID + "'"
			return out
		}
	}

	if isUpdate {
		return h.handleUpdateOperation(out, params, appID, table, filter, access)
	}
	return h.handleSelectOperation(out, params, appID, table, filter, access)
}

// wantsLegacyFullTableFetch keeps backward compatibility for scripts (auto-kqxs, wu_kqxs.vue)
// that call get-table-data / csm_obj_tables without limit|offset|take|sort.
// Admin grids always send limit+offset and stay on server-paged path.
func wantsLegacyFullTableFetch(params map[string]any) bool {
	if params == nil {
		return true
	}
	for _, key := range []string{"take", "limit", "offset", "lastkey", "cursor", "sort"} {
		if _, ok := params[key]; ok {
			return false
		}
	}
	return true
}

func (h *TableHandler) handleSelectOperation(out map[string]any, params map[string]any, appID, table string, filter model.SearchFilter, access *security.UserAccessContext) map[string]any {
	var dataResult map[string]any
	if wantsLegacyFullTableFetch(params) {
		dataResult = h.rm.Filter(appID, table, filter)
	} else {
		take := data.DefaultFilterTake
		if v, ok := params["take"].(float64); ok && int(v) > 0 {
			take = int(v)
		} else if v, ok := params["limit"].(float64); ok && int(v) > 0 {
			take = int(v)
		}
		cursor, _ := params["lastkey"].(string)
		if cursor == "" {
			cursor, _ = params["cursor"].(string)
		}
		offset := 0
		if ov, ok := params["offset"].(float64); ok && int(ov) >= 0 {
			offset = int(ov)
		}
		dataResult = h.rm.FilterWithPagination(appID, table, filter, cursor, offset, take, parseSortSpecs(params))
	}

	rows := dataResult["rows"]
	if rows == nil {
		rows = dataResult["data"]
	}
	rowSlice, _ := rows.([]any)
	if appID == "csm" && table == "sys_autos" {
		rowSlice = security.FilterSysAutosRows(rowSlice, filter, access)
	} else {
		var maps []map[string]any
		for _, item := range rowSlice {
			if m, ok := item.(map[string]any); ok {
				maps = append(maps, m)
			}
		}
		filtered := security.ApplyTableReadRowFilters(appID, table, maps, access, h.rm)
		rowSlice = make([]any, 0, len(filtered))
		for _, m := range filtered {
			rowSlice = append(rowSlice, m)
		}
	}
	if rowSlice == nil {
		rowSlice = []any{}
	}
	out["success"] = true
	out["rows"] = rowSlice
	if v, ok := dataResult["nextCursor"]; ok {
		out["nextCursor"] = v
	}
	if v, ok := dataResult["totalCount"]; ok {
		out["totalCount"] = v
	}
	if v, ok := dataResult["truncated"]; ok {
		out["truncated"] = v
	}
	if v, ok := dataResult["sortTruncated"]; ok {
		out["sortTruncated"] = v
	}
	return out
}

func (h *TableHandler) handleUpdateOperation(out map[string]any, params map[string]any, appID, table string, filter model.SearchFilter, access *security.UserAccessContext) map[string]any {
	command, _ := params["command"].(string)
	command = strings.ToLower(strings.TrimSpace(command))
	if command == "" {
		command = "create"
	}
	pkFields := parsePkFields(params)

	objUpdate, _ := params["obj_update"].(map[string]any)
	if objUpdate == nil {
		objUpdate, _ = params["data"].(map[string]any)
	}
	if objUpdate == nil {
		objUpdate = map[string]any{}
	}

	if _, ok := objUpdate["user_address"]; !ok {
		if legacy, ok := objUpdate["user_adress"]; ok {
			objUpdate["user_address"] = legacy
		}
	}

	if table == "csm_group_members" && access != nil && !access.IsDev {
		if access.IsAdmin {
			adminAppID := strings.TrimSpace(access.AppID)
			if adminAppID != "" {
				// Admin manages sub-users in their signed-in app scope.
				objUpdate["app_id"] = adminAppID
			}
		}
		if command == "delete" && access.IsSubUser {
			out["success"] = false
			out["message"] = "Sub-user không có quyền xóa sub-user trên bảng csm_group_members"
			return out
		}
		if command == "create" {
			// Java handleUpdateTableOperation: parent_account_id luôn tự gán theo tài khoản
			// đăng nhập, không cho client chọn tay.
			preferredParent := ""
			if len(access.ParentAccountCandidates) > 0 {
				preferredParent = strings.TrimSpace(access.ParentAccountCandidates[0])
			}
			if preferredParent == "" {
				preferredParent = strings.TrimSpace(access.AppID)
			}
			if preferredParent == "" {
				out["success"] = false
				out["message"] = "Không xác định được parent_account_id để tạo sub-user"
				return out
			}
			objUpdate["parent_account_id"] = preferredParent
			// Java: normalizeManagedSubUserPermissions + autoGenerateSubUserCredentials.
			// app_token is built from the ADMIN's app_id (never client-supplied app_id)
			// and app_id is removed from the row (not a business field in sub-user rows).
			h.autoGenerateSubUserCredentials(objUpdate, access)
		} else if parent, ok := objUpdate["parent_account_id"].(string); ok && strings.TrimSpace(parent) != "" {
			if !containsIdentifierCandidate(access.ParentAccountCandidates, parent) {
				out["success"] = false
				out["message"] = "Không được chuyển sub-user sang parent_account_id khác"
				return out
			}
		}
	}

	if command == "create" && (table == "csm_accounts" || table == "csm_group_members") {
		if _, msg := security.ValidateRequiredAccountExpiryOnCreate(objUpdate, objUpdate); msg != "" {
			out["success"] = false
			out["message"] = msg
			return out
		}
	}

	objUpdate, pwErr := h.handlePasswordChange(appID, table, objUpdate, filter)
	if pwErr != "" {
		out["success"] = false
		out["message"] = pwErr
		return out
	}

	hasFilter := len(filter.Conditions) > 0 || filter.Field != ""
	var existing []map[string]any
	var finalObj map[string]any
	if hasFilter || command == "update" || command == "delete" {
		existing = h.lookupRecordsForUpdate(appID, table, filter, objUpdate, pkFields, command)
		if access != nil && len(existing) > 0 {
			existing = security.FilterRowsForUpdate(table, existing, access, appID, h.rm)
		}
		if table == "csm_group_members" && access != nil && access.IsAdmin && !access.IsDev {
			existing = h.filterSubUserRowsForAdminLoginApp(existing, access)
		}
		if (command == "update" || command == "delete") && len(existing) == 0 {
			if id, ok := objUpdate["id"]; ok && strings.TrimSpace(fmt.Sprint(id)) != "" {
				fallbackRows := h.filterRowsForUpdate(appID, table, model.EqFilter("id", id))
				if len(fallbackRows) > 0 {
					fallback := fallbackRows
					if access != nil {
						fallback = security.FilterRowsForUpdateWithoutDataScope(table, fallback, access, appID, h.rm)
					}
					if table == "csm_group_members" && access != nil && access.IsAdmin && !access.IsDev {
						fallback = h.filterSubUserRowsForAdminLoginApp(fallback, access)
					}
					existing = fallback
				}
			}
		}
		if table == "csm_group_members" && access != nil && access.IsSubUser && command == "update" {
			if msg := validateSubUserSelfEdit(objUpdate, existing, access); msg != "" {
				out["success"] = false
				out["message"] = msg
				return out
			}
		}
		if command == "delete" {
			if len(existing) == 0 {
				out["success"] = false
				out["message"] = "Không tìm thấy bản ghi để xóa"
				return out
			}
			target := existing[0]
			if err := h.rm.DeleteRecord(appID, table, target); err != nil {
				out["success"] = false
				out["message"] = err.Error()
				return out
			}
			out["success"] = true
			out["command"] = "delete"
			out["message"] = "Record deleted"
			out["updated_row"] = target
			cacheepoch.BumpSSRContentEpochForTable(table)
			h.emitSocketUpdate(appID, table, "delete", target)
			return out
		}
		if command == "update" && len(existing) == 0 {
			out["success"] = false
			out["message"] = "Không tìm thấy bản ghi để cập nhật"
			return out
		}
		if len(existing) > 0 {
			finalObj = existing[0]
			for k, v := range objUpdate {
				finalObj[k] = v
			}
		}
	}
	if finalObj == nil {
		if hasFilter {
			row := h.rm.Find(appID, table, filter)
			if len(row) > 0 {
				finalObj = row
				for k, v := range objUpdate {
					finalObj[k] = v
				}
			} else {
				finalObj = h.mergeWithExisting(appID, table, objUpdate)
			}
		} else {
			finalObj = h.mergeWithExisting(appID, table, objUpdate)
		}
	}
	if len(existing) == 0 && finalObj != nil {
		if id := strings.TrimSpace(fmt.Sprint(finalObj["id"])); id != "" {
			existing = []map[string]any{finalObj}
		}
	}

	if access != nil && finalObj != nil {
		if msg := security.ApplyDataScopeCreateGuard(appID, table, finalObj, access, h.rm); msg != "" {
			out["success"] = false
			out["message"] = msg
			return out
		}
		security.EnsureBusinessPermissionSchemaValues(appID, table, finalObj, access, h.rm)
	}
	if table == "csm_accounts" && access != nil {
		if command == "create" || hasDataAppIDsMutation(finalObj) {
			security.NormalizeDataAppIdsField(finalObj, access)
		}
	}
	if table == "csm_group_members" && finalObj != nil {
		delete(finalObj, "data_app_ids")
		delete(finalObj, "dataAppIds")
	}
	if msg := h.validateIncomingCategoryConsistency(appID, table, finalObj); msg != "" {
		out["success"] = false
		out["message"] = msg
		return out
	}
	if command == "create" && len(pkFields) > 0 && !hasAnyPrimaryKeyValue(finalObj, pkFields) {
		out["success"] = false
		out["message"] = "Thiếu khóa chính: cần ít nhất 1 trong các trường " + strings.Join(pkFields, ", ")
		return out
	}
	if command == "create" && len(pkFields) > 0 && h.rm.FindByCustomPK(appID, table, finalObj, pkFields) != nil {
		out["success"] = false
		out["message"] = "Trùng khóa chính khi tạo dữ liệu"
		return out
	}
	if table == "csm_accounts" || table == "csm_group_members" {
		security.ApplyAccountExpiryFromInput(finalObj, finalObj)
		h.ensurePassEncrypted(table, finalObj, existing)
	}

	cmd, err := h.rm.CreateRecord(appID, table, finalObj, pkFields)
	if err != nil {
		out["success"] = false
		out["message"] = err.Error()
		return out
	}
	out["success"] = true
	out["command"] = cmd
	out["message"] = "ok"
	out["updated_row"] = trimLargeCodeFields(table, finalObj)
	out["obj_name"] = table
	out["app_id"] = appID
	action := cmd
	if action == "" {
		action = "update"
	}
	if cleanup := h.autoCleanupContentRows(appID, table, finalObj, action); len(cleanup) > 0 {
		out["dedupe_cleanup"] = cleanup
	}
	cacheepoch.BumpSSRContentEpochForTable(table)
	h.emitSocketUpdate(appID, table, action, finalObj)
	h.captureLearningFromSavedRow(appID, table, action, finalObj)
	return out
}

// autoGenerateSubUserCredentials mirrors Java TableHandler.autoGenerateSubUserCredentials:
//   - parent_account_id fallback = admin's app_id
//   - app_token = CsmEncrypt(adminAppID_____loginID_____user_____0) built from the ADMIN's
//     app_id — never from client-supplied app_id (frontend grid sends the csm namespace)
//   - app_id is REMOVED from sub-user rows (isolated by app context, not a business field)
//   - seeds canonical profile/session fields (username/email/full_name, refresh, login_version,
//     actived, permissions defaults, permissionBitfield/schema/dataScope)
func (h *TableHandler) autoGenerateSubUserCredentials(objUpdate map[string]any, access *security.UserAccessContext) {
	if parent, _ := objUpdate["parent_account_id"].(string); strings.TrimSpace(parent) == "" && strings.TrimSpace(access.AppID) != "" {
		objUpdate["parent_account_id"] = strings.TrimSpace(access.AppID)
	}
	loginID := strings.TrimSpace(tableStringFromAny(objUpdate["login_identifier"]))
	if loginID == "" {
		return
	}

	// Auto-encrypt pass (helper chống double-encryption)
	h.ensurePassEncrypted("csm_group_members", objUpdate, nil)

	// Auto-generate app_token from the ADMIN's app context if not already set
	if existingToken, _ := objUpdate["app_token"].(string); strings.TrimSpace(existingToken) == "" {
		effectiveAppID := strings.TrimSpace(access.AppID)
		if effectiveAppID == "" {
			effectiveAppID = "csm"
		}
		rawToken := util.BuildRawToken(effectiveAppID, loginID, "user", util.ResolveAccessRight("user"))
		generated := h.rm.CsmEncrypt(rawToken)
		objUpdate["app_token"] = generated
		if refresh, _ := objUpdate["refresh"].(string); strings.TrimSpace(refresh) == "" {
			objUpdate["refresh"] = generated
		}
	}

	// Keep app_id on sub-user row aligned with the admin app context.
	if effectiveAppID := strings.TrimSpace(access.AppID); effectiveAppID != "" {
		objUpdate["app_id"] = effectiveAppID
	}

	// Canonical profile/session fields for csm_group_members
	if v, _ := objUpdate["username"].(string); strings.TrimSpace(v) == "" {
		objUpdate["username"] = loginID
	}
	if v, _ := objUpdate["email"].(string); strings.TrimSpace(v) == "" {
		objUpdate["email"] = loginID
	}
	if _, ok := objUpdate["phoneNumber"]; !ok {
		objUpdate["phoneNumber"] = ""
	}
	if v, _ := objUpdate["full_name"].(string); strings.TrimSpace(v) == "" {
		objUpdate["full_name"] = loginID
	}
	if _, ok := objUpdate["user_address"]; !ok {
		objUpdate["user_address"] = ""
	}
	if _, ok := objUpdate["avatar"]; !ok {
		objUpdate["avatar"] = ""
	}
	if _, ok := objUpdate["group_rights"]; !ok {
		objUpdate["group_rights"] = []any{}
	}
	if _, ok := objUpdate["source_app_token"]; !ok {
		objUpdate["source_app_token"] = ""
	}

	appToken, _ := objUpdate["app_token"].(string)
	refresh, _ := objUpdate["refresh"].(string)
	refreshToken, _ := objUpdate["refresh_token"].(string)
	if strings.TrimSpace(refreshToken) == "" {
		if strings.TrimSpace(refresh) != "" {
			refreshToken = refresh
		} else {
			refreshToken = appToken
		}
		objUpdate["refresh_token"] = refreshToken
	}
	if strings.TrimSpace(refresh) == "" {
		objUpdate["refresh"] = refreshToken
	}
	if _, ok := objUpdate["refresh_token_ip"]; !ok {
		objUpdate["refresh_token_ip"] = ""
	}
	if _, ok := objUpdate["refresh_token_ua"]; !ok {
		objUpdate["refresh_token_ua"] = ""
	}
	if _, ok := objUpdate["refresh_token_expiry"]; !ok {
		objUpdate["refresh_token_expiry"] = int64(0)
	}
	if _, ok := objUpdate["login_version"]; !ok {
		objUpdate["login_version"] = 0
	}
	if _, ok := objUpdate["loginVersion"]; !ok {
		objUpdate["loginVersion"] = objUpdate["login_version"]
	}
	if _, ok := objUpdate["actived"]; !ok {
		objUpdate["actived"] = true
	}
	if _, ok := objUpdate["permissions"]; !ok {
		objUpdate["permissions"] = []any{}
	}
	if _, ok := objUpdate["menusPermissions"]; !ok {
		objUpdate["menusPermissions"] = []any{}
	}
	if _, ok := objUpdate["permissionsAdd"]; !ok {
		objUpdate["permissionsAdd"] = []any{}
	}
	if _, ok := objUpdate["permissionsDeny"]; !ok {
		objUpdate["permissionsDeny"] = []any{}
	}
	if _, ok := objUpdate["menusPermissionsAdd"]; !ok {
		objUpdate["menusPermissionsAdd"] = []any{}
	}
	if _, ok := objUpdate["menusPermissionsDeny"]; !ok {
		objUpdate["menusPermissionsDeny"] = []any{}
	}

	permissions := model.StringListFromRecord(objUpdate, "permissions")
	menusPermissions := model.StringListFromRecord(objUpdate, "menusPermissions")
	bitfield := util.BuildBitfield(permissions, menusPermissions, false)
	objUpdate["permissionBitfield"] = util.ToCompactToken(bitfield)
	objUpdate["permissionSchemaVersion"] = "v3"
	objUpdate["dataScope"] = util.ResolveDataScope(bitfield)
}

func (h *TableHandler) captureLearningFromSavedRow(appID, table, action string, row map[string]any) {
	if row == nil {
		return
	}
	tbl := strings.ToLower(strings.TrimSpace(table))
	if tbl == "sys_autos" {
		pType := tableIntFromAny(row["p_type"])
		if pType < 0 || pType > 5 {
			return
		}
		code := strings.TrimSpace(tableStringFromAny(row["p_code"]))
		if code == "" {
			return
		}
		name := strings.TrimSpace(tableStringFromAny(row["p_name"]))
		if name == "" {
			name = "sys_autos"
		}
		summary := code
		if len(summary) > 400 {
			summary = summary[:400] + "..."
		}
		requestText := "Auto-learn from saved sys_autos " + name + " (" + action + ")"
		_ = services.RecordSuccessfulCodeEdit(h.cfg, h.rm, appID, requestText, summary, "code", name, 1)
		services.MaybeAutoLearnFromInternet(h.cfg, h.rm, appID, "code", requestText+"\n"+summary)
		return
	}

	if tbl == "csm_menu" || tbl == "index" {
		if menuJSON, ok := extractSavedMenuJSONFromRow(row); ok {
			requestText := "Auto-learn from saved " + tbl + " (" + action + ")"
			_ = services.RecordSuccessfulMenuEdit(h.cfg, h.rm, appID, requestText, menuJSON)
			services.MaybeAutoLearnFromInternet(h.cfg, h.rm, appID, "menu_json", requestText+"\n"+truncateForLearning(menuJSON, 2000))
		}
	}
}

func extractSavedMenuJSONFromRow(row map[string]any) (string, bool) {
	if row == nil {
		return "", false
	}
	if dataVal, ok := row["data"]; ok && dataVal != nil {
		if b, err := json.Marshal(dataVal); err == nil {
			candidate := strings.TrimSpace(string(b))
			if candidate != "" {
				return candidate, true
			}
		}
	}
	for _, key := range []string{"menu_json", "menuJson", "menu", "json"} {
		if v, ok := row[key]; ok && v != nil {
			if b, err := json.Marshal(v); err == nil {
				candidate := strings.TrimSpace(string(b))
				if candidate != "" {
					return candidate, true
				}
			}
		}
	}
	return "", false
}

func tableStringFromAny(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}

func tableIntFromAny(v any) int {
	s := strings.TrimSpace(tableStringFromAny(v))
	if s == "" {
		return 0
	}
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return 0
}

func truncateForLearning(input string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	runes := []rune(input)
	if len(runes) <= maxLen {
		return input
	}
	return string(runes[:maxLen]) + "..."
}

func (h *TableHandler) filterSubUserRowsForAdminLoginApp(rows []map[string]any, access *security.UserAccessContext) []map[string]any {
	if len(rows) == 0 || access == nil {
		return rows
	}
	adminAppID := strings.TrimSpace(access.AppID)
	if adminAppID == "" {
		return rows
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		rowAppID := h.resolveSubUserRowAppID(row)
		if rowAppID == "" || strings.EqualFold(rowAppID, adminAppID) {
			out = append(out, row)
		}
	}
	return out
}

func (h *TableHandler) resolveSubUserRowAppID(row map[string]any) string {
	if row == nil {
		return ""
	}
	if appID := strings.TrimSpace(tableStringFromAny(row["app_id"])); appID != "" {
		return appID
	}
	for _, key := range []string{"app_token", "appToken", "source_app_token"} {
		token := strings.TrimSpace(tableStringFromAny(row[key]))
		if token == "" {
			continue
		}
		if appID := strings.TrimSpace(util.AppIDFromToken(h.rm, token)); appID != "" {
			return appID
		}
	}
	return ""
}

func (h *TableHandler) resolveAccess(auth *security.AuthUser) *security.UserAccessContext {
	resolved := auth
	if auth != nil && h.us != nil && !auth.SessionFresh {
		if fresh := h.us.ResolveSessionAuth(*auth); fresh != nil {
			resolved = fresh
		}
	}
	return security.UserAccessFromAuth(resolved, h.rm)
}

func (h *TableHandler) emitSocketUpdate(appID, table, action string, row map[string]any) {
	if h.socket == nil || row == nil {
		return
	}
	h.socket.EmitUpdateNotification(h.rm, appID, table, action, row)
}

func (h *TableHandler) mergeWithExisting(appID, table string, objUpdate map[string]any) map[string]any {
	existing := h.rm.FindExistingByPK(appID, table, objUpdate)
	if len(existing) == 0 {
		return objUpdate
	}
	for k, v := range objUpdate {
		existing[k] = v
	}
	return existing
}

func (h *TableHandler) handlePasswordChange(appID, table string, objUpdate map[string]any, filter model.SearchFilter) (map[string]any, string) {
	changeFlag, hasChange := objUpdate["_changePassword"]
	oldPW, _ := objUpdate["_oldPassword"].(string)
	newPW, _ := objUpdate["_newPassword"].(string)
	delete(objUpdate, "_changePassword")
	delete(objUpdate, "_oldPassword")
	delete(objUpdate, "_newPassword")

	isChange := false
	if hasChange {
		switch v := changeFlag.(type) {
		case bool:
			isChange = v
		case string:
			isChange = strings.EqualFold(v, "true")
		}
	}
	if !isChange {
		return objUpdate, ""
	}
	if strings.TrimSpace(newPW) == "" {
		return objUpdate, "Mật khẩu mới không được để trống"
	}
	existing := h.rm.Find(appID, table, filter)
	if len(existing) == 0 {
		return objUpdate, "Không xác định được tài khoản để đổi mật khẩu"
	}
	loginID := firstNonEmpty(existing, "username", "email", "phoneNumber", "login_identifier")
	if loginID == "" {
		return objUpdate, "Không xác định được tài khoản để đổi mật khẩu"
	}
	if oldPW != "" {
		stored, _ := existing["pass"].(string)
		if stored != "" {
			expected := h.rm.CsmEncrypt(loginID + "_____" + oldPW)
			if expected != stored {
				return objUpdate, "Mật khẩu cũ không chính xác"
			}
		}
	}
	objUpdate["pass"] = h.rm.CsmEncrypt(loginID + "_____" + newPW)
	return objUpdate, ""
}

func (h *TableHandler) ensurePassEncrypted(table string, objUpdate map[string]any, existingRecords []map[string]any) {
	if objUpdate == nil {
		return
	}
	passVal, _ := objUpdate["pass"].(string)
	passVal = strings.TrimSpace(passVal)
	if passVal == "" {
		return
	}
	if decrypted, err := h.rm.CsmDecrypt(passVal); err == nil && strings.Contains(decrypted, "_____") {
		return
	}
	loginID := ""
	if table == "csm_accounts" {
		loginID = firstNonEmpty(objUpdate, "username", "email", "phoneNumber")
		if loginID == "" && len(existingRecords) > 0 {
			loginID = firstNonEmpty(existingRecords[0], "username", "email", "phoneNumber")
		}
	} else if table == "csm_group_members" {
		loginID = firstNonEmpty(objUpdate, "login_identifier", "username", "email", "phoneNumber")
		if loginID == "" && len(existingRecords) > 0 {
			loginID = firstNonEmpty(existingRecords[0], "login_identifier", "username", "email", "phoneNumber")
		}
	}
	if loginID == "" {
		return
	}
	objUpdate["pass"] = h.rm.CsmEncrypt(loginID + "_____" + passVal)
}

func trimLargeCodeFields(table string, row map[string]any) map[string]any {
	if table != "sys_autos" {
		return row
	}
	if code, ok := row["p_code"].(string); ok && len(code) > 8192 {
		row["p_code"] = "[saved:" + tableItoa(len(code)) + " chars]"
	}
	return row
}

func parseSearchFilter(params map[string]any) model.SearchFilter {
	for _, key := range []string{"e_where", "filter", "searchFilter", "where"} {
		raw, ok := params[key]
		if !ok || raw == nil {
			continue
		}
		if filter := decodeSearchFilter(raw); !isEmptySearchFilter(filter) {
			return filter
		}
		if plain, ok := raw.(map[string]any); ok {
			if converted := plainMapToSearchFilter(plain); !isEmptySearchFilter(converted) {
				return converted
			}
		}
	}
	return model.SearchFilter{}
}

func decodeSearchFilter(raw any) model.SearchFilter {
	b, err := json.Marshal(raw)
	if err != nil {
		return model.SearchFilter{}
	}
	var filter model.SearchFilter
	if json.Unmarshal(b, &filter) != nil {
		return model.SearchFilter{}
	}
	return filter
}

func isEmptySearchFilter(filter model.SearchFilter) bool {
	return filter.Field == "" && len(filter.Conditions) == 0
}

func plainMapToSearchFilter(raw map[string]any) model.SearchFilter {
	if field, ok := raw["field"].(string); ok && strings.TrimSpace(field) != "" {
		if decoded := decodeSearchFilter(raw); !isEmptySearchFilter(decoded) {
			return decoded
		}
	}
	if operator, ok := raw["operator"].(string); ok {
		if condsRaw, ok := raw["conditions"].([]any); ok && len(condsRaw) > 0 {
			if decoded := decodeSearchFilter(raw); !isEmptySearchFilter(decoded) {
				return decoded
			}
		}
		_ = operator
	}

	var conditions []model.SearchFilter
	for key, value := range raw {
		if key == "operator" || key == "conditions" {
			continue
		}
		if value == nil {
			continue
		}
		conditions = append(conditions, model.EqFilter(key, value))
	}
	switch len(conditions) {
	case 0:
		return model.SearchFilter{}
	case 1:
		return conditions[0]
	default:
		return model.SearchFilter{Operator: "AND", Conditions: conditions}
	}
}

func firstNonEmpty(record map[string]any, keys ...string) string {
	for _, key := range keys {
		if v, ok := record[key].(string); ok && strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func (h *TableHandler) HandleBulkUpdate(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	ops, _ := params["operations"].([]any)
	continueOnError, _ := params["continue_on_error"].(bool)
	if !continueOnError && params["continue_on_error"] == nil {
		continueOnError = true
	}
	appID, _ := params["app_id"].(string)
	table, _ := params["obj_name"].(string)
	var results []any
	successCount, failedCount := 0, 0
	for i, op := range ops {
		opMap, ok := op.(map[string]any)
		if !ok {
			failedCount++
			results = append(results, map[string]any{"index": i, "success": false, "message": "Invalid operation"})
			if !continueOnError {
				break
			}
			continue
		}
		if v, ok := opMap["app_id"].(string); ok && v != "" {
			appID = v
		}
		if v, ok := opMap["obj_name"].(string); ok && v != "" {
			table = v
		}
		merged := map[string]any{"app_id": appID, "obj_name": table}
		for k, v := range opMap {
			merged[k] = v
		}
		result := h.handleTableOperation(merged, true, auth)
		entry := map[string]any{"index": i}
		for k, v := range result {
			entry[k] = v
		}
		if success, _ := result["success"].(bool); success {
			successCount++
		} else {
			failedCount++
			if !continueOnError {
				results = append(results, entry)
				break
			}
		}
		results = append(results, entry)
	}
	return model.OKResponse(map[string]any{
		"total": len(ops), "successCount": successCount, "failedCount": failedCount, "results": results,
	})
}

func (h *TableHandler) HandleIndexExisting(params map[string]any) *model.StandardResponse {
	appID, _ := params["app_id"].(string)
	if appID == "" {
		appID = "csm"
	}
	table, _ := params["obj_name"].(string)
	if table == "" {
		return model.ErrorResponse(400, "obj_name required")
	}
	count, err := h.rm.IndexExistingRecords(appID, table)
	if err != nil {
		return model.ErrorResponse(500, "Lỗi khi lập chỉ mục bảng: "+err.Error())
	}
	return model.OKResponse(map[string]any{
		"success": true,
		"message": "Đã lập chỉ mục thành công cho bảng: " + table,
		"indexed": count,
	})
}

func (h *TableHandler) RestoreDB(params map[string]any) *model.StandardResponse {
	return model.NotImplemented("restoredb — use migrate tool for Pebble restore")
}

func (h *TableHandler) BackupDB(params map[string]any) *model.StandardResponse {
	return model.NotImplemented("backupdb — use filesystem backup of pebble store")
}

func (h *TableHandler) MigrateKeys(params map[string]any) *model.StandardResponse {
	return model.OKResponse(map[string]any{"success": true, "message": "No key migration needed for Pebble store"})
}

func (h *TableHandler) HandleCreateTable(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth != nil {
		access := h.resolveAccess(auth)
		appID, _ := params["app_id"].(string)
		if access != nil && !access.IsDev && !access.CanAccessAppData(appID) {
			return model.ErrorResponse(403, "Forbidden app data access")
		}
	}
	result := h.rm.CreateTable(params)
	return model.OKResponse(result)
}

func (h *TableHandler) HandleDropTable(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth != nil {
		access := h.resolveAccess(auth)
		appID, _ := params["app_id"].(string)
		if access != nil && !access.IsDev && !access.CanAccessAppData(appID) {
			return model.ErrorResponse(403, "Forbidden app data access")
		}
	}
	result := h.rm.DropTable(params)
	return model.OKResponse(result)
}

func tableItoa(n int) string {
	return strconv.Itoa(n)
}

func containsIdentifierCandidate(candidates []string, value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	for _, candidate := range candidates {
		if strings.EqualFold(strings.TrimSpace(candidate), value) {
			return true
		}
	}
	return false
}

func validateSubUserSelfEdit(objUpdate map[string]any, records []map[string]any, access *security.UserAccessContext) string {
	if len(records) == 0 {
		return "Không tìm thấy bản ghi để cập nhật"
	}
	currentUserID := ""
	if len(access.OwnerCandidates) > 0 {
		currentUserID = access.OwnerCandidates[0]
	}
	if strings.TrimSpace(currentUserID) == "" {
		return "Không xác định được ID của sub-user hiện tại"
	}
	for _, row := range records {
		rowID := strings.TrimSpace(fmt.Sprint(row["id"]))
		if !strings.EqualFold(rowID, currentUserID) {
			return "Sub-user chỉ được cập nhật thông tin của chính mình, không được sửa record của người khác"
		}
	}
	restricted := []string{
		"parent_account_id", "permissions", "menusPermissions", "permissionBitfield",
		"permissionSchemaVersion", "dataScope", "group_id", "app_id", "app_token",
	}
	for _, field := range restricted {
		if _, ok := objUpdate[field]; !ok {
			continue
		}
		requested := objUpdate[field]
		if requested == nil || strings.TrimSpace(fmt.Sprint(requested)) == "" {
			continue
		}
		if !isRestrictedFieldActuallyChanged(field, requested, records) {
			continue
		}
		return "Sub-user không được thay đổi trường hệ thống: " + field + ". Bạn chỉ được sửa: password/pass và các thông tin cá nhân khác"
	}
	return ""
}

func isRestrictedFieldActuallyChanged(field string, requested any, records []map[string]any) bool {
	requestedNorm := normalizeComparableFieldValue(requested)
	for _, row := range records {
		storedNorm := normalizeComparableFieldValue(row[field])
		if storedNorm != requestedNorm {
			return true
		}
	}
	return false
}

func normalizeComparableFieldValue(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case []any:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			parts = append(parts, strings.TrimSpace(fmt.Sprint(item)))
		}
		sort.Strings(parts)
		return strings.Join(parts, ",")
	case []string:
		parts := append([]string(nil), t...)
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}
		sort.Strings(parts)
		return strings.Join(parts, ",")
	default:
		s := strings.TrimSpace(fmt.Sprint(v))
		if strings.HasPrefix(s, "[") {
			var arr []any
			if json.Unmarshal([]byte(s), &arr) == nil {
				return normalizeComparableFieldValue(arr)
			}
		}
		return s
	}
}

func (h *TableHandler) lookupRecordsForUpdate(appID, table string, filter model.SearchFilter, objUpdate map[string]any, pkFields []string, command string) []map[string]any {
	cmd := strings.ToLower(strings.TrimSpace(command))
	isMutating := cmd == "update" || cmd == "delete"

	var rows []map[string]any

	// Mirror Java handleUpdateTableOperation: id-first lookup for update/delete.
	if isMutating {
		if id, ok := objUpdate["id"]; ok && strings.TrimSpace(fmt.Sprint(id)) != "" {
			rows = h.filterRowsForUpdate(appID, table, model.EqFilter("id", id))
		}
	}

	// Fallback to client filter when id lookup misses.
	if len(rows) == 0 && (len(filter.Conditions) > 0 || filter.Field != "") {
		rows = h.filterRowsForUpdate(appID, table, filter)
	}

	// Identity fallback when e_where is too strict (e.g. stale id in AND filter).
	if len(rows) == 0 && isMutating {
		if fallback := buildIdentityFallbackFilter(filter); fallback != nil {
			rows = h.filterRowsForUpdate(appID, table, *fallback)
		}
	}

	// Java repeats id lookup after identity fallback for update.
	if len(rows) == 0 && cmd == "update" {
		if id, ok := objUpdate["id"]; ok && strings.TrimSpace(fmt.Sprint(id)) != "" {
			rows = h.filterRowsForUpdate(appID, table, model.EqFilter("id", id))
		}
	}

	return rows
}

func (h *TableHandler) filterRowsForUpdate(appID, table string, filter model.SearchFilter) []map[string]any {
	result := h.rm.Filter(appID, table, filter)
	rawRows, _ := result["rows"].([]any)
	out := make([]map[string]any, 0, len(rawRows))
	for _, item := range rawRows {
		if row, ok := item.(map[string]any); ok {
			out = append(out, row)
		}
	}
	return out
}

// buildIdentityFallbackFilter mirrors Java TableHandler when e_where is too strict (e.g. stale id).
func buildIdentityFallbackFilter(source model.SearchFilter) *model.SearchFilter {
	eq := data.ExtractEqConditions(source)
	if len(eq) == 0 {
		return nil
	}
	preferred := []string{"id", "email", "phoneNumber", "username", "login_identifier"}
	var conditions []model.SearchFilter
	for _, field := range preferred {
		value, ok := eq[field]
		if !ok || strings.TrimSpace(fmt.Sprint(value)) == "" {
			continue
		}
		conditions = append(conditions, model.EqFilter(field, value))
		if field == "id" || field == "email" {
			break
		}
	}
	if appIDVal, ok := eq["app_id"]; ok && strings.TrimSpace(fmt.Sprint(appIDVal)) != "" {
		conditions = append(conditions, model.EqFilter("app_id", appIDVal))
	}
	if len(conditions) == 0 {
		return nil
	}
	if len(conditions) == 1 {
		f := conditions[0]
		return &f
	}
	fallback := model.SearchFilter{Operator: "AND", Conditions: conditions}
	return &fallback
}

func parseSortSpecs(params map[string]any) []model.SortSpec {
	raw, ok := params["sort"]
	if !ok || raw == nil {
		return nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]model.SortSpec, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		field, _ := m["field"].(string)
		order, _ := m["order"].(string)
		field = strings.TrimSpace(field)
		if field == "" {
			continue
		}
		out = append(out, model.SortSpec{Field: field, Order: order})
	}
	return out
}

func parsePkFields(params map[string]any) []string {
	raw, ok := params["pk_fields"]
	if !ok || raw == nil {
		return nil
	}
	switch v := raw.(type) {
	case []string:
		var out []string
		for _, item := range v {
			if s := strings.TrimSpace(item); s != "" {
				out = append(out, s)
			}
		}
		return out
	case []any:
		var out []string
		for _, item := range v {
			if s, ok := item.(string); ok {
				if s = strings.TrimSpace(s); s != "" {
					out = append(out, s)
				}
			}
		}
		return out
	case string:
		s := strings.TrimSpace(v)
		if s == "" {
			return nil
		}
		if strings.HasPrefix(s, "[") {
			var arr []any
			if json.Unmarshal([]byte(s), &arr) == nil {
				return parsePkFields(map[string]any{"pk_fields": arr})
			}
		}
		return []string{s}
	default:
		return nil
	}
}

func hasAnyPrimaryKeyValue(row map[string]any, pkFields []string) bool {
	if row == nil {
		return false
	}
	for _, field := range pkFields {
		if v, ok := row[field]; ok && strings.TrimSpace(fmt.Sprint(v)) != "" {
			return true
		}
	}
	return false
}

func hasDataAppIDsMutation(row map[string]any) bool {
	if row == nil {
		return false
	}
	_, ok := row["data_app_ids"]
	if ok {
		return true
	}
	_, ok = row["dataAppIds"]
	return ok
}
