package handlers

import (
	"strings"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
)

// handleIndexTableOperation mirrors Java TableHandler.handleIndexTableOperation and Rust equivalent.
func (h *TableHandler) handleIndexTableOperation(
	out map[string]any,
	params map[string]any,
	appID string,
	filter model.SearchFilter,
	isUpdate bool,
	access *security.UserAccessContext,
) map[string]any {
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

	var filterResult map[string]any
	if params["limit"] != nil {
		if v, ok := params["limit"].(float64); ok && int(v) > 0 {
			offset := 0
			if ov, ok := params["offset"].(float64); ok {
				offset = int(ov)
			}
			filterResult = h.rm.FilterWithPagination(appID, "index", filter, "", offset, int(v))
		}
	}
	if filterResult == nil && (params["take"] != nil || cursor != "") {
		filterResult = h.rm.FilterWithPagination(appID, "index", filter, cursor, 0, take)
	}
	if filterResult == nil {
		filterResult = h.rm.Filter(appID, "index", filter)
	}

	tables := toMapSlice(filterResult["rows"])
	if tables == nil {
		tables = []map[string]any{}
	}

	if !isUpdate {
		rows := extractIndexReadRows(tables)
		if rows == nil {
			rows = []any{}
		}
		out["success"] = true
		out["id"] = "index"
		out["rows"] = rows
		if v, ok := filterResult["nextCursor"]; ok {
			out["nextCursor"] = v
		}
		return out
	}

	if access != nil && !access.IsDev && !access.CanAccessAppData(appID) {
		out["success"] = false
		out["message"] = "Bạn không có quyền thay đổi dữ liệu của ứng dụng '" + appID + "'"
		return out
	}

	command, _ := params["command"].(string)
	command = strings.ToLower(strings.TrimSpace(command))

	objUpdate, _ := params["obj_update"].(map[string]any)
	if objUpdate == nil {
		objUpdate, _ = params["data"].(map[string]any)
	}
	if len(objUpdate) == 0 {
		out["success"] = false
		out["message"] = "Thiếu dữ liệu cập nhật"
		return out
	}

	recordID, _ := objUpdate["id"].(string)
	existingRows := tables
	if recordID != "" && len(existingRows) == 0 {
		existingRows = toMapSlice(h.rm.Filter(appID, "index", model.EqFilter("id", recordID))["rows"])
	}

	switch command {
	case "create":
		if recordID == "" {
			out["success"] = false
			out["message"] = "Thiếu giá trị khóa chính 'id'"
			return out
		}
		if len(h.rm.FindExistingByPK(appID, "index", objUpdate)) > 0 && len(existingRows) == 0 {
			out["success"] = false
			out["message"] = "Trùng khóa chính (id) cho bảng index"
			return out
		}
		if len(existingRows) == 0 {
			cmd, err := h.rm.CreateRecord(appID, "index", objUpdate, nil)
			if err != nil {
				out["success"] = false
				out["message"] = err.Error()
				return out
			}
			out["success"] = true
			out["command"] = cmd
			out["message"] = "Thao tác thành công"
			out["updated_row"] = objUpdate
			out["obj_name"] = "index"
			out["app_id"] = appID
			return out
		}
	case "delete":
		for _, row := range existingRows {
			if id, _ := row["id"].(string); id == recordID {
				if err := h.rm.DeleteRecord(appID, "index", row); err != nil {
					out["success"] = false
					out["message"] = err.Error()
					return out
				}
				out["success"] = true
				out["command"] = "delete"
				out["message"] = "Thao tác thành công"
				out["updated_row"] = row
				out["obj_name"] = "index"
				out["app_id"] = appID
				return out
			}
		}
		out["success"] = false
		out["message"] = "Không tìm thấy bản ghi index"
		return out
	case "update", "":
	default:
		out["success"] = false
		out["message"] = "Lệnh không hợp lệ cho bảng index"
		return out
	}

	for _, row := range existingRows {
		if id, _ := row["id"].(string); id != recordID {
			continue
		}
		merged := cloneMap(row)
		for k, v := range objUpdate {
			merged[k] = v
		}
		cmd, err := h.rm.CreateRecord(appID, "index", merged, nil)
		if err != nil {
			out["success"] = false
			out["message"] = err.Error()
			return out
		}
		out["success"] = true
		out["command"] = cmd
		out["message"] = "Thao tác thành công"
		out["updated_row"] = merged
		out["obj_name"] = "index"
		out["app_id"] = appID
		return out
	}

	out["success"] = false
	out["message"] = "Không tìm thấy bản ghi index"
	return out
}

// extractIndexReadRows — when exactly one index row is returned, unwrap `.data` array (Java/Rust parity).
func extractIndexReadRows(tables []map[string]any) []any {
	if len(tables) == 1 {
		record := tables[0]
		if data, ok := record["data"].([]any); ok {
			out := make([]any, 0, len(data))
			for _, item := range data {
				if m, ok := item.(map[string]any); ok {
					out = append(out, m)
				}
			}
			return out
		}
		return []any{record}
	}
	out := make([]any, 0, len(tables))
	for _, row := range tables {
		out = append(out, row)
	}
	return out
}

func cloneMap(src map[string]any) map[string]any {
	dst := make(map[string]any, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}
