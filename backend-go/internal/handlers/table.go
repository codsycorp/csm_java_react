package handlers

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/services"
)

var reservedIndexIDs = map[string]struct{}{
	"menu": {}, "menuList": {}, "menuR": {}, "roleList": {}, "accessRights": {}, "menu_permissions": {},
}

type TableHandler struct {
	rm     *data.RecordManager
	us     *services.UserService
	socket SocketBroadcaster
}

// SocketBroadcaster pushes realtime table updates to connected clients.
type SocketBroadcaster interface {
	EmitUpdateNotification(rm *data.RecordManager, appID, table, action string, row map[string]any)
}

func NewTableHandler(rm *data.RecordManager, us *services.UserService, socket SocketBroadcaster) *TableHandler {
	return &TableHandler{rm: rm, us: us, socket: socket}
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
	appID := security.ResolveRequestAppID(params, auth)
	if table == "index" {
		appID = security.ResolveMenuIndexAppID(params, auth, filter)
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
	structRec := h.rm.Find(appID, "index", model.EqFilter("id", table))
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
	appID := security.ResolveRequestAppID(params, auth)
	if table == "index" && !isUpdate {
		appID = security.ResolveMenuIndexAppID(params, auth, filter)
	}
	access := security.UserAccessFromAuth(auth, h.rm)

	table, filter = security.ResolveSystemUserTableForRead(table, isUpdate, params, filter, access)

	onlyMySubusers, _ := params["only_my_subusers"].(bool)
	filter = security.MergeOnlyMySubusersFilter(table, isUpdate, onlyMySubusers, filter, access)

	allowScopedAutosetup := security.IsAllowedAutosetupTemplateRead(appID, table, isUpdate, filter, access)
	if !allowScopedAutosetup {
		if msg := security.ValidateActionPermission(access, security.ResolveRequiredAction(params, isUpdate)); msg != "" {
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

func (h *TableHandler) handleSelectOperation(out map[string]any, params map[string]any, appID, table string, filter model.SearchFilter, access *security.UserAccessContext) map[string]any {
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

	var dataResult map[string]any
	if params["take"] != nil || params["lastkey"] != nil || params["cursor"] != nil || params["limit"] != nil {
		dataResult = h.rm.FilterWithPagination(appID, table, filter, cursor, 0, take)
	} else {
		dataResult = h.rm.Filter(appID, table, filter)
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
	return out
}

func (h *TableHandler) handleUpdateOperation(out map[string]any, params map[string]any, appID, table string, filter model.SearchFilter, access *security.UserAccessContext) map[string]any {
	command, _ := params["command"].(string)
	command = strings.ToLower(strings.TrimSpace(command))
	if command == "" {
		command = "create"
	}

	objUpdate, _ := params["obj_update"].(map[string]any)
	if objUpdate == nil {
		objUpdate, _ = params["data"].(map[string]any)
	}
	if objUpdate == nil {
		objUpdate = map[string]any{}
	}

	if table == "csm_group_members" && access != nil && !access.IsDev {
		if command == "delete" && access.IsSubUser {
			out["success"] = false
			out["message"] = "Sub-user không có quyền xóa sub-user trên bảng csm_group_members"
			return out
		}
		if command == "create" {
			preferredParent := access.AppID
			if preferredParent == "" && len(access.ParentAccountCandidates) > 0 {
				preferredParent = access.ParentAccountCandidates[0]
			}
			if preferredParent == "" {
				out["success"] = false
				out["message"] = "Không xác định được parent_account_id để tạo sub-user"
				return out
			}
			objUpdate["parent_account_id"] = preferredParent
		} else if parent, ok := objUpdate["parent_account_id"].(string); ok && strings.TrimSpace(parent) != "" {
			if !containsIdentifierCandidate(access.ParentAccountCandidates, parent) {
				out["success"] = false
				out["message"] = "Không được chuyển sub-user sang parent_account_id khác"
				return out
			}
		}
	}

	objUpdate, pwErr := h.handlePasswordChange(appID, table, objUpdate, filter)
	if pwErr != "" {
		out["success"] = false
		out["message"] = pwErr
		return out
	}

	hasFilter := len(filter.Conditions) > 0 || filter.Field != ""
	var finalObj map[string]any
	if hasFilter || command == "update" || command == "delete" {
		existing := h.lookupRecordsForUpdate(appID, table, filter, objUpdate)
		if access != nil && len(existing) > 0 {
			existing = security.FilterRowsForUpdate(table, existing, access, appID, h.rm)
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
			h.emitSocketUpdate(appID, table, "delete", target)
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
			existing := h.rm.Find(appID, table, filter)
			if len(existing) > 0 {
				finalObj = existing
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

	cmd, err := h.rm.CreateRecord(appID, table, finalObj, nil)
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
	h.emitSocketUpdate(appID, table, action, finalObj)
	return out
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
	for _, key := range []string{"e_where", "filter", "searchFilter"} {
		if raw, ok := params[key]; ok {
			b, _ := json.Marshal(raw)
			var filter model.SearchFilter
			if json.Unmarshal(b, &filter) == nil {
				return filter
			}
		}
	}
	return model.SearchFilter{}
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
		access := security.UserAccessFromAuth(auth, h.rm)
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
		access := security.UserAccessFromAuth(auth, h.rm)
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
		requested := strings.TrimSpace(fmt.Sprint(objUpdate[field]))
		if requested == "" {
			continue
		}
		for _, row := range records {
			stored := strings.TrimSpace(fmt.Sprint(row[field]))
			if stored != requested {
				return "Sub-user không được thay đổi trường hệ thống: " + field + ". Bạn chỉ được sửa: password/pass và các thông tin cá nhân khác"
			}
		}
	}
	return ""
}

func (h *TableHandler) lookupRecordsForUpdate(appID, table string, filter model.SearchFilter, objUpdate map[string]any) []map[string]any {
	if id, ok := objUpdate["id"]; ok && strings.TrimSpace(fmt.Sprint(id)) != "" {
		if row := h.rm.Find(appID, table, model.EqFilter("id", id)); len(row) > 0 {
			return []map[string]any{row}
		}
	}
	result := h.rm.Filter(appID, table, filter)
	rows, _ := result["rows"].([]any)
	var out []map[string]any
	for _, item := range rows {
		if row, ok := item.(map[string]any); ok {
			out = append(out, row)
		}
	}
	if len(out) == 0 {
		if row := h.rm.Find(appID, table, filter); len(row) > 0 {
			return []map[string]any{row}
		}
	}
	return out
}
