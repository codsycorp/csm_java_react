package handlers

import (
	"log"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/services"
)

type MenuHandler struct {
	rm *data.RecordManager
}

func NewMenuHandler(rm *data.RecordManager) *MenuHandler {
	return &MenuHandler{rm: rm}
}

func (h *MenuHandler) HandleMenuList(auth *security.AuthUser) *model.StandardResponse {
	record := h.rm.Find(services.CSMAppID, "index", model.EqFilter("id", "menuList"))
	allMenus := toMapSlice(record["data"])
	filtered := filterMenusByAuth(allMenus, auth)
	return model.OKResponse(map[string]any{
		"list": filtered, "total": len(filtered), "pageSize": 10, "current": 1,
	})
}

func (h *MenuHandler) HandleMenuByRoleID(params map[string]any) *model.StandardResponse {
	roleID := firstParam(params, "id", "roleId", "role_id")
	record := h.rm.Find(services.CSMAppID, "index", model.EqFilter("id", "menuR"))
	data := toMapSlice(record["data"])
	var menuIDs []any
	if roleID == "1" {
		for _, item := range data {
			if id, ok := item["id"]; ok {
				menuIDs = append(menuIDs, id)
			}
		}
	}
	return model.OKResponse(menuIDs)
}

func (h *MenuHandler) HandleMenuItem(method string, params map[string]any) *model.StandardResponse {
	record := h.rm.Find(services.CSMAppID, "index", model.EqFilter("id", "menuList"))
	list := toMapSlice(record["data"])
	switch strings.ToUpper(method) {
	case "POST":
		params["id"] = uuid.NewString()
		list = append(list, params)
	case "PUT":
		id, _ := params["id"].(string)
		for i, item := range list {
			if itemID, _ := item["id"].(string); itemID == id {
				for k, v := range params {
					list[i][k] = v
				}
				break
			}
		}
	case "DELETE":
		id, _ := params["id"].(string)
		var next []map[string]any
		for _, item := range list {
			if itemID, _ := item["id"].(string); itemID != id {
				next = append(next, item)
			}
		}
		list = next
	}
	_, _ = h.rm.CreateRecord(services.CSMAppID, "index", map[string]any{"id": "menuList", "data": list}, []string{"id"})
	return model.OKResponse(map[string]any{})
}

type RoleHandler struct {
	rm *data.RecordManager
}

func NewRoleHandler(rm *data.RecordManager) *RoleHandler {
	return &RoleHandler{rm: rm}
}

func (h *RoleHandler) HandleRoleList(params map[string]any) *model.StandardResponse {
	record := h.rm.Find(services.CSMAppID, "index", model.EqFilter("id", "roleList"))
	list := toMapSlice(record["data"])
	nameFilter, _ := params["name"].(string)
	statusFilter, _ := params["status"].(string)
	var filtered []map[string]any
	for _, item := range list {
		name := stringField(item, "name")
		status := stringField(item, "status")
		if nameFilter != "" && !strings.Contains(name, nameFilter) {
			continue
		}
		if statusFilter != "" && !strings.Contains(status, statusFilter) {
			continue
		}
		filtered = append(filtered, item)
	}
	return model.OKResponse(map[string]any{
		"list": filtered, "total": len(filtered), "pageSize": 10, "current": 1,
	})
}

func (h *RoleHandler) HandleRoleItem(method string, params map[string]any) *model.StandardResponse {
	record := h.rm.Find(services.CSMAppID, "index", model.EqFilter("id", "roleList"))
	list := toMapSlice(record["data"])
	result := map[string]any{}
	for k, v := range params {
		result[k] = v
	}
	switch strings.ToUpper(method) {
	case "POST":
		result["id"] = uuid.NewString()
		list = append(list, result)
	case "PUT":
		id, _ := params["id"].(string)
		for i, item := range list {
			if itemID, _ := item["id"].(string); itemID == id {
				for k, v := range params {
					list[i][k] = v
					result[k] = v
				}
				break
			}
		}
	case "DELETE":
		id, _ := params["id"].(string)
		var next []map[string]any
		for _, item := range list {
			if itemID, _ := item["id"].(string); itemID != id {
				next = append(next, item)
			}
		}
		list = next
	}
	_, _ = h.rm.CreateRecord(services.CSMAppID, "index", map[string]any{"id": "roleList", "data": list}, []string{"id"})
	return model.OKResponse(result)
}

func (h *RoleHandler) HandleRoleMenu() *model.StandardResponse {
	record := h.rm.Find(services.CSMAppID, "index", model.EqFilter("id", "menuR"))
	data := record["data"]
	if data == nil {
		data = []any{}
	}
	return model.OKResponse(data)
}

type HomeHandler struct {
	rm *data.RecordManager
}

func NewHomeHandler(rm *data.RecordManager) *HomeHandler {
	return &HomeHandler{rm: rm}
}

func (h *HomeHandler) HandleHome() *model.StandardResponse {
	return model.OKResponse(map[string]any{
		"totalVisits": 10000, "totalUsers": 432, "totalOrders": 218, "totalIncome": 98000000,
	})
}

func (h *HomeHandler) HandleHomePie() *model.StandardResponse {
	return model.OKResponse([]map[string]any{
		{"name": "Loại A", "value": 45},
		{"name": "Loại B", "value": 30},
		{"name": "Loại C", "value": 25},
	})
}

func (h *HomeHandler) HandleHomeLine(_ map[string]any) *model.StandardResponse {
	var data []map[string]any
	for i := 1; i <= 12; i++ {
		data = append(data, map[string]any{"month": "Tháng " + strconv.Itoa(i), "value": (i * 73) % 1000})
	}
	return model.OKResponse(data)
}

func (h *HomeHandler) HandleNotifications() *model.StandardResponse {
	return model.OKResponse([]map[string]any{{
		"id": "000000001", "title": "Chào mừng bạn đến với hệ thống",
		"datetime": "2025-04-15", "type": "notification",
	}})
}

func (h *HomeHandler) HandleGooglebotStats(params map[string]any) *model.StandardResponse {
	limit := intParam(params, "limit", 50)
	offset := intParam(params, "offset", 0)
	rows := h.rm.Filter("csm", "googlebot_visits", model.SearchFilter{})
	all := toMapSlice(rows["rows"])
	end := offset + limit
	if end > len(all) {
		end = len(all)
	}
	slice := []any{}
	if offset < len(all) {
		for _, row := range all[offset:end] {
			slice = append(slice, row)
		}
	}
	return model.OKResponse(map[string]any{"rows": slice, "total": len(all), "limit": limit, "offset": offset})
}

func (h *HomeHandler) HandleGooglebotDelete(params map[string]any) *model.StandardResponse {
	deleteAll, _ := params["all"].(bool)
	if !deleteAll {
		deleteAll, _ = params["deleteAll"].(bool)
	}
	deleted := 0
	if deleteAll {
		all := h.rm.Filter("csm", "googlebot_visits", model.SearchFilter{})
		for _, row := range toMapSlice(all["rows"]) {
			if err := h.rm.DeleteRecord("csm", "googlebot_visits", row); err == nil {
				deleted++
			}
		}
	} else {
		for _, id := range parseIDList(params["ids"]) {
			row := h.rm.Find("csm", "googlebot_visits", model.EqFilter("id", id))
			if len(row) > 0 {
				if err := h.rm.DeleteRecord("csm", "googlebot_visits", row); err == nil {
					deleted++
				}
			}
		}
	}
	return model.OKResponse(map[string]any{"deleted": deleted})
}

type InitHandler struct {
	rm *data.RecordManager
}

func NewInitHandler(rm *data.RecordManager) *InitHandler {
	return &InitHandler{rm: rm}
}

func (h *InitHandler) AutoInitDefaultData() {
	if _, err := h.seedDefaultData(); err != nil {
		logInit("InitHandler auto-init failed: " + err.Error())
	} else {
		logInit("InitHandler: default data initialized")
	}
}

func (h *InitHandler) HandleCreateDefaultData() *model.StandardResponse {
	msg, err := h.seedDefaultData()
	if err != nil {
		return model.ErrorResponse(500, err.Error())
	}
	resp := model.NewResponse()
	resp.Set("code", 200)
	resp.Set("success", true)
	resp.Set("message", msg)
	return resp
}

func (h *InitHandler) seedDefaultData() (string, error) {
	schemas := []struct {
		name, app string
		pk, fields []string
	}{
		{"csm_ai_menu_requests", "csm", []string{"id"}, []string{"id", "menu_name", "request_data", "created_at"}},
		{"csm_depts", "csm", []string{"id", "dept_code"}, []string{"id", "parent_dept_id", "dept_code", "dept_name", "status"}},
		{"csm_roles", "csm", []string{"id", "role_code"}, []string{"id", "role_code", "role_name", "status"}},
		{"csm_permissions", "csm", []string{"id", "permission_code"}, []string{"id", "permission_code", "permission_name"}},
		{"csm_role_permissions", "csm", []string{"id", "role_id", "permission_id"}, []string{"id", "role_id", "permission_id"}},
		{"csm_user_depts", "csm", []string{"id", "user_id", "dept_id"}, []string{"id", "user_id", "dept_id"}},
		{"csm_user_roles", "csm", []string{"id", "user_id", "role_id"}, []string{"id", "user_id", "role_id"}},
		{"sys_autos", "csm", []string{"id", "p_name", "p_type"}, []string{"id", "p_name", "p_type", "p_code"}},
		{"routers", "csm", []string{"path"}, []string{"path", "component", "layout"}},
		{"index", "csm", []string{"id"}, []string{"id", "struct", "data"}},
	}
	for _, s := range schemas {
		if err := h.ensureTableSchema(s.app, s.name, s.pk, s.fields); err != nil {
			return "", err
		}
	}
	if err := h.ensureUserSchemas(); err != nil {
		return "", err
	}
	if err := h.ensureAdminUser(); err != nil {
		return "", err
	}
	if err := h.seedSystemMenuIfMissing(); err != nil {
		return "", err
	}
	if err := h.ensureFrameworkAutoSetupSysAutos(); err != nil {
		return "", err
	}
	return "Default data seed completed", nil
}

// ensureFrameworkAutoSetupSysAutos creates csm/sys_autos p_name=csm p_type=0 when missing.
// Migrated DBs often only have csm:1 (page template); frontend loadAutoMenuItem expects p_type=0.
func (h *InitHandler) ensureFrameworkAutoSetupSysAutos() error {
	probe := map[string]any{"p_name": "csm", "p_type": 0}
	if len(h.rm.FindByCustomPK("csm", "sys_autos", probe, []string{"p_name", "p_type"})) > 0 {
		return nil
	}
	placeholder := h.rm.CsmEncrypt("// CSM framework auto-setup placeholder\nexport default { setup() { return {}; } }")
	record := map[string]any{
		"id":          uuid.NewString(),
		"p_name":      "csm",
		"p_type":      0,
		"p_code":      placeholder,
		"description": "CSM framework auto-setup template (seeded)",
	}
	_, err := h.rm.CreateRecord("csm", "sys_autos", record, []string{"p_name", "p_type"})
	return err
}

func (h *InitHandler) ensureTableSchema(appID, tableName string, pk, fields []string) error {
	existing := h.rm.Find(appID, "index", model.EqFilter("id", tableName))
	if len(existing) > 0 {
		return nil
	}
	_, err := h.rm.CreateRecord(appID, "index", map[string]any{
		"id": tableName,
		"struct": map[string]any{"fieldsPK": pk, "fields": fields},
	}, []string{"id"})
	return err
}

func (h *InitHandler) ensureUserSchemas() error {
	if len(h.rm.Find("csm", "index", model.EqFilter("id", "csm_accounts"))) > 0 {
		return nil
	}
	if err := h.ensureTableSchema("csm", "csm_accounts", []string{"id"},
		[]string{"id", "username", "email", "phoneNumber", "pass", "app_token", "app_id", "permissions", "menusPermissions", "dev"}); err != nil {
		return err
	}
	return h.ensureTableSchema("csm", "csm_group_members", []string{"id"},
		[]string{"id", "parent_account_id", "login_identifier", "pass", "permissions", "menusPermissions"})
}

func (h *InitHandler) ensureAdminUser() error {
	filter := model.SearchFilter{Field: "username", FilterType: "eqIgnoreCase", Value: "admin"}
	existing := h.rm.Find("csm", "csm_accounts", filter)
	if len(existing) > 0 {
		return nil
	}
	pass := h.rm.CsmEncrypt("admin_____123456789admin")
	appToken := h.rm.CsmEncrypt("csm_____admin_____admin_____1")
	admin := map[string]any{
		"id": uuid.NewString(), "username": "admin", "pass": pass, "app_token": appToken, "refresh": appToken,
		"app_id": "csm", "roles": []any{"admin"}, "permissions": []any{"admin"}, "menusPermissions": []any{"*"},
		"actived": true, "dev": true, "login_version": 1, "full_name": "Admin User",
	}
	_, err := h.rm.CreateRecord("csm", "csm_accounts", admin, []string{"id"})
	return err
}

func (h *InitHandler) seedSystemMenuIfMissing() error {
	if len(h.rm.Find("csm", "index", model.EqFilter("id", "menuR"))) > 0 {
		return nil
	}
	menuID := uuid.NewString()
	_, err := h.rm.CreateRecord("csm", "index", map[string]any{
		"id": "menuR",
		"data": []any{map[string]any{"id": menuID, "menuType": 0, "name": "common.menu.system"}},
	}, []string{"id"})
	return err
}

type SeoHandler struct {
	rm *data.RecordManager
}

func NewSeoHandler(rm *data.RecordManager) *SeoHandler {
	return &SeoHandler{rm: rm}
}

func (h *SeoHandler) HandleSeo(params map[string]any) *model.StandardResponse {
	url, _ := params["url"].(string)
	if strings.TrimSpace(url) == "" {
		return model.ErrorResponse(400, "url required")
	}
	return model.OKResponse(map[string]any{"url": url, "title": "", "description": "", "keywords": ""})
}

func filterMenusByAuth(allMenus []map[string]any, auth *security.AuthUser) []map[string]any {
	if auth == nil {
		return nil
	}
	privileged := auth.Dev
	if !privileged {
		for _, p := range auth.Permissions {
			if strings.EqualFold(p, "admin") || strings.EqualFold(p, "dev") {
				privileged = true
				break
			}
		}
	}
	if privileged {
		return allMenus
	}
	return filterMenusByPermissions(allMenus, auth.MenusPermissions)
}

func filterMenusByPermissions(menus []map[string]any, allowed []string) []map[string]any {
	if allowed == nil {
		return menus
	}
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, id := range allowed {
		allowedSet[id] = struct{}{}
	}
	var out []map[string]any
	for _, menu := range menus {
		id, _ := menu["id"].(string)
		if _, ok := allowedSet[id]; !ok {
			continue
		}
		item := copyMap(menu)
		if children, ok := menu["children"].([]any); ok {
			childMaps := make([]map[string]any, 0, len(children))
			for _, c := range children {
				if m, ok := c.(map[string]any); ok {
					childMaps = append(childMaps, m)
				}
			}
			filteredChildren := filterMenusByPermissions(childMaps, allowed)
			if len(filteredChildren) > 0 {
				item["children"] = toAnySlice(filteredChildren)
			} else {
				delete(item, "children")
			}
		}
		out = append(out, item)
	}
	return out
}

func toMapSlice(v any) []map[string]any {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	var out []map[string]any
	for _, item := range arr {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func toAnySlice(rows []map[string]any) []any {
	out := make([]any, len(rows))
	for i, row := range rows {
		out[i] = row
	}
	return out
}

func copyMap(src map[string]any) map[string]any {
	dst := make(map[string]any, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func stringField(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func firstParam(params map[string]any, keys ...string) string {
	for _, key := range keys {
		if v, ok := params[key].(string); ok && v != "" {
			return v
		}
	}
	return ""
}

func intParam(params map[string]any, key string, def int) int {
	if v, ok := params[key].(float64); ok {
		return int(v)
	}
	return def
}

func parseIDList(v any) []string {
	switch t := v.(type) {
	case []any:
		var out []string
		for _, item := range t {
			if s, ok := item.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	case string:
		parts := strings.Split(t, ",")
		var out []string
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				out = append(out, p)
			}
		}
		return out
	default:
		return nil
	}
}

func logInit(msg string) {
	log.Println(msg)
}
