package security

import (
	"fmt"
	"strconv"
	"strings"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/util"
)

type UserAccessContext struct {
	IsAdmin                 bool
	IsDev                   bool
	IsSubUser               bool
	AppID                   string
	Permissions             []string
	MenusPermissions        []string
	DataScope               string
	DataAppIDs              []string
	OwnerCandidates         []string
	ParentAccountCandidates []string
	DepartmentCandidates    []string
	BranchCandidates        []string
}

func UserAccessFromAuth(auth *AuthUser, rm *data.RecordManager) *UserAccessContext {
	if auth == nil {
		return nil
	}
	tokenMeta := util.ParseAppToken(rm, auth.AppToken)
	// Mirror Java resolveCurrentUserAccessContext: sub-user is determined by app_token role only.
	isSubUser := util.IsSubUserRole(tokenMeta.Role)
	if auth.IsSubUser && tokenMeta.Role == "" {
		isSubUser = true
	}
	menusPermissions := append([]string{}, auth.MenusPermissions...)
	appID := auth.AppID
	if appID == "" {
		appID = util.AppIDFromToken(rm, auth.AppToken)
	}
	if appID == "" {
		appID = resolvePrimaryAppIDFromMenus(menusPermissions)
	}

	permissions := append([]string{}, auth.Permissions...)
	var parsedToken uint64
	hasToken := false
	if auth.PermissionBitfield != "" {
		if token, ok := util.ParseSecurityToken(auth.PermissionBitfield); ok {
			parsedToken = token
			hasToken = true
			permissions = util.PermissionsFromBitfield(auth.PermissionBitfield)
		}
	}

	if auth.Dev {
		util.ApplyDevPermissionElevation(&permissions, &menusPermissions, appID)
	}
	if isSubUser {
		// Mirror Java mapSubUserRecordToUser: strip admin/dev at login only, not scope:all.
		permissions = util.SubtractCaseInsensitive(permissions, []string{"admin", "dev"})
		if !util.HasAnyActionPermission(permissions) {
			permissions = util.MergeUniqueCaseInsensitive(permissions, []string{"view"})
		}
	}

	isAdminByDefault := !auth.Dev && !isSubUser
	isAdmin := !isSubUser && (isAdminByDefault ||
		util.HasActionPermission(permissions, "admin") ||
		strings.EqualFold(tokenMeta.Role, "admin") ||
		(hasToken && util.HasAdminPrivilege(parsedToken)))

	dataScope := auth.DataScope
	if hasToken {
		dataScope = util.ResolveDataScope(parsedToken)
	} else if dataScope == "" {
		dataScope = util.ResolveDataScope(util.BuildBitfield(permissions, menusPermissions, auth.Dev))
	}

	if !auth.Dev && !isSubUser && isAdmin && hasLegacyFullAppScope(menusPermissions, appID) {
		dataScope = "ALL"
		permissions = util.MergeUniqueCaseInsensitive(permissions, []string{"admin", "scope:all"})
		isAdmin = true
	}
	if auth.Dev {
		dataScope = "ALL"
	}
	if isAdminByDefault && !isSubUser && !auth.Dev {
		util.ApplyMainAccountPermissionElevation(&permissions, &menusPermissions, appID)
		dataScope = "ALL"
		isAdmin = true
	}

	dataAppIDs := auth.DataAppIDs
	if isSubUser {
		dataAppIDs = nil
	}

	parentCandidates := collectParentAccountCandidates(auth)
	if rm != nil && isSubUser && strings.TrimSpace(auth.UserID) != "" {
		if sub := rm.Find("csm", "csm_group_members", model.EqFilter("id", auth.UserID)); len(sub) > 0 {
			if parent, ok := sub["parent_account_id"].(string); ok && strings.TrimSpace(parent) != "" {
				parentCandidates = mergeUniqueStrings(parentCandidates, parent)
			}
		}
	}

	return &UserAccessContext{
		IsAdmin:                 isAdmin,
		IsDev:                   auth.Dev,
		IsSubUser:               isSubUser,
		AppID:                   appID,
		Permissions:             permissions,
		MenusPermissions:        menusPermissions,
		DataScope:               dataScope,
		DataAppIDs:              dataAppIDs,
		OwnerCandidates:         collectOwnerCandidates(auth),
		ParentAccountCandidates: parentCandidates,
		DepartmentCandidates:    collectDepartmentCandidates(auth),
		BranchCandidates:        collectBranchCandidates(auth),
	}
}

func (ctx UserAccessContext) CanAccessAppData(targetAppID string) bool {
	target := strings.TrimSpace(targetAppID)
	if target == "" {
		return true
	}
	if ctx.IsDev {
		return true
	}
	if strings.EqualFold(ctx.AppID, "csm") {
		return true
	}
	if strings.EqualFold(ctx.AppID, target) {
		return true
	}
	for _, id := range ctx.DataAppIDs {
		if strings.EqualFold(id, target) {
			return true
		}
	}
	return false
}

func ValidateActionPermission(ctx *UserAccessContext, requiredAction string) string {
	if ctx == nil || requiredAction == "" {
		return ""
	}
	// Java validateActionPermissionForCurrentUser: only dev bypasses action checks.
	if ctx.IsDev {
		return ""
	}
	if util.HasActionPermission(ctx.Permissions, requiredAction) {
		return ""
	}
	switch requiredAction {
	case "view":
		return "Bạn không có quyền xem dữ liệu (view)"
	case "create":
		return "Bạn không có quyền tạo dữ liệu (create)"
	case "edit":
		return "Bạn không có quyền cập nhật dữ liệu (edit)"
	case "delete":
		return "Bạn không có quyền xóa dữ liệu (delete)"
	default:
		return "Bạn không có quyền thực hiện thao tác này"
	}
}

func ResolveRequiredAction(params map[string]any, isUpdate bool) string {
	if !isUpdate {
		return "view"
	}
	cmd, _ := params["command"].(string)
	switch strings.ToLower(strings.TrimSpace(cmd)) {
	case "create":
		return "create"
	case "update":
		return "edit"
	case "delete":
		return "delete"
	default:
		return ""
	}
}

func ValidateSystemUserTableAccess(tableName string, isUpdate bool, params map[string]any, filter model.SearchFilter, ctx *UserAccessContext) string {
	if ctx == nil || tableName != "csm_accounts" || ctx.IsDev {
		return ""
	}
	if isAllowedSelfCSMAccountsAccess(isUpdate, params, filter, ctx) {
		return ""
	}
	return "Bảng csm_accounts chỉ dành cho tài khoản dev. Admin/Sub-user vui lòng thao tác trên csm_group_members."
}

// ResolveSystemUserTableForRead maps non-dev admin/sub-user operations from csm_accounts to csm_group_members
// unless the request targets the caller's own main account row (Java isAllowedSelfCsmAccountsAccess).
func ResolveSystemUserTableForRead(tableName string, isUpdate bool, params map[string]any, filter model.SearchFilter, ctx *UserAccessContext) (string, model.SearchFilter) {
	if ctx == nil || tableName != "csm_accounts" || ctx.IsDev {
		return tableName, filter
	}
	if isAllowedSelfCSMAccountsAccess(isUpdate, params, filter, ctx) {
		return tableName, filter
	}
	return "csm_group_members", filter
}

func ValidatePermissionGroupAppBoundary(appID, tableName string, ctx *UserAccessContext) string {
	if ctx == nil || ctx.IsDev || tableName != "csm_roles" {
		return ""
	}
	contextApp := strings.TrimSpace(ctx.AppID)
	targetApp := strings.TrimSpace(appID)
	if contextApp == "" || targetApp == "" {
		return ""
	}
	if !strings.EqualFold(contextApp, targetApp) {
		return "Bạn chỉ được quản lý Nhóm quyền trong app_id của chính mình."
	}
	return ""
}

func MergeOnlyMySubusersFilter(tableName string, isUpdate, onlyMySubusers bool, existing model.SearchFilter, ctx *UserAccessContext) model.SearchFilter {
	if isUpdate || tableName != "csm_group_members" || !onlyMySubusers || ctx == nil || len(ctx.ParentAccountCandidates) == 0 {
		return existing
	}
	scope := buildFieldScopeFilter(ctx.ParentAccountCandidates, "parent_account_id")
	if scope == nil {
		return existing
	}
	if existing.Field == "" && len(existing.Conditions) == 0 {
		return *scope
	}
	return model.SearchFilter{Operator: "AND", Conditions: []model.SearchFilter{existing, *scope}}
}

func ApplyTableReadRowFilters(appID, tableName string, rows []map[string]any, ctx *UserAccessContext, rm *data.RecordManager) []map[string]any {
	if ctx == nil {
		return rows
	}
	data := filterManagedAccountDescendants(tableName, rows, ctx, appID, rm)
	data = applyDataScopeRowFilter(tableName, data, ctx)
	data = filterMainAccountRows(tableName, data, rm)
	if tableName == "csm_accounts" {
		data = maskSelfAccountRowsForNonDev(data, ctx)
	}
	decryptPassForDisplay(tableName, data, rm)
	return data
}

func FilterRowsForUpdate(tableName string, records []map[string]any, ctx *UserAccessContext, appID string, rm *data.RecordManager) []map[string]any {
	isAdminNonDev := ctx.IsAdmin && !ctx.IsDev
	if tableName == "csm_accounts" && !ctx.IsDev {
		visible := resolveManagedAccountVisibleIDSet(appID, ctx, rm)
		var filtered []map[string]any
		for _, row := range records {
			if visible[fieldValueAsIdentity(row["id"])] {
				filtered = append(filtered, row)
			}
		}
		records = filtered
	}
	if tableName == "csm_group_members" && (isAdminNonDev || ctx.IsDev) {
		var filtered []map[string]any
		for _, row := range records {
			if isOwnedSubUserRow(row, ctx) {
				filtered = append(filtered, row)
			}
		}
		records = filtered
	}
	return applyDataScopeRowFilter(tableName, records, ctx)
}

func FilterSysAutosRows(rows []any, filter model.SearchFilter, ctx *UserAccessContext) []any {
	if ctx == nil || ctx.IsDev {
		return rows
	}
	eqValues := collectEqValues(filter)
	requestedPName := eqValues["p_name"]
	if requestedPName == "" {
		return []any{}
	}
	userAppID := strings.TrimSpace(ctx.AppID)
	out := make([]any, 0)
	for _, item := range rows {
		row, ok := item.(map[string]any)
		if !ok {
			continue
		}
		pName, _ := row["p_name"].(string)
		if requestedPName != pName || !isPTypeZero(row["p_type"]) {
			continue
		}
		// Mirror Java TableHandler: match user's app_id to requested p_name (not resolved alias).
		if userAppID != "" && isSameOrBroadcastVariant(userAppID, requestedPName) {
			out = append(out, row)
		}
	}
	return out
}

func IsAllowedAutosetupTemplateRead(appID, tableName string, isUpdate bool, filter model.SearchFilter, ctx *UserAccessContext) bool {
	if isUpdate || ctx == nil || appID != "csm" || tableName != "sys_autos" {
		return false
	}
	if ctx.IsDev {
		return true
	}
	eqValues := collectEqValues(filter)
	if !isPTypeZeroStr(eqValues["p_type"]) || eqValues["p_name"] == "" {
		return false
	}
	effectiveAppID := resolveAutosetupEffectiveAppID(ctx, eqValues["p_name"])
	return effectiveAppID != "" && isSameOrBroadcastVariant(effectiveAppID, eqValues["p_name"])
}

func ResolveRequestAppID(params map[string]any, auth *AuthUser) string {
	if appID, ok := params["app_id"].(string); ok && strings.TrimSpace(appID) != "" {
		return strings.TrimSpace(appID)
	}
	if auth != nil && strings.TrimSpace(auth.AppID) != "" {
		return strings.TrimSpace(auth.AppID)
	}
	return "default"
}

func ResolveMenuIndexAppID(params map[string]any, auth *AuthUser, filter model.SearchFilter) string {
	requested := ResolveRequestAppID(params, auth)
	if !isMenuIndexFilter(filter) || auth == nil || auth.Dev {
		return requested
	}
	home := strings.TrimSpace(auth.AppID)
	if home == "" || strings.EqualFold(home, "csm") || auth.CanAccessAppData(requested) {
		return requested
	}
	return home
}

var menuIndexIDs = map[string]struct{}{"menu": {}, "menur": {}, "menulist": {}}

func isMenuIndexFilter(filter model.SearchFilter) bool {
	if len(filter.Conditions) > 0 {
		for _, c := range filter.Conditions {
			if isMenuIndexFilter(c) {
				return true
			}
		}
		return false
	}
	if filter.Field != "id" || !strings.EqualFold(filter.FilterType, "eq") {
		return false
	}
	_, ok := menuIndexIDs[strings.ToLower(strings.TrimSpace(filter.ValueString()))]
	return ok
}

func hasLegacyFullAppScope(menusPermissions []string, appID string) bool {
	normalizedAppID := strings.ToLower(strings.TrimSpace(appID))
	if normalizedAppID == "" || len(menusPermissions) == 0 {
		return false
	}
	for _, menu := range menusPermissions {
		normalized := strings.ToLower(strings.TrimSpace(menu))
		if normalized == normalizedAppID || normalized == "app:"+normalizedAppID || normalized == "/"+normalizedAppID {
			return true
		}
	}
	return false
}

func resolvePrimaryAppIDFromMenus(menusPermissions []string) string {
	for _, menu := range menusPermissions {
		token := strings.TrimSpace(menu)
		if token == "" || token == "*" {
			continue
		}
		lower := strings.ToLower(token)
		if rest, ok := strings.CutPrefix(lower, "app:"); ok {
			if rest = strings.TrimSpace(rest); rest != "" {
				return rest
			}
			continue
		}
		if strings.HasPrefix(lower, "/") || strings.Contains(token, ":") {
			continue
		}
		return token
	}
	return ""
}

func collectOwnerCandidates(auth *AuthUser) []string {
	var out []string
	for _, value := range []string{auth.UserID, auth.Username, auth.Email, auth.PhoneNumber, auth.AppToken} {
		if normalized := normalizedIdentity(value); normalized != "" {
			out = append(out, normalized)
		}
	}
	return out
}

func mergeUniqueStrings(base []string, extra ...string) []string {
	seen := make(map[string]struct{}, len(base)+len(extra))
	out := make([]string, 0, len(base)+len(extra))
	for _, value := range append(base, extra...) {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, value)
	}
	return out
}

func collectParentAccountCandidates(auth *AuthUser) []string {
	var out []string
	for _, value := range []string{auth.UserID, auth.AppID, auth.Username, auth.Email, auth.PhoneNumber} {
		value = strings.TrimSpace(value)
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

func collectDepartmentCandidates(auth *AuthUser) []string {
	if normalized := normalizedIdentity(auth.DeptID); normalized != "" {
		return []string{normalized}
	}
	return nil
}

func collectBranchCandidates(auth *AuthUser) []string {
	if normalized := normalizedIdentity(auth.BranchID); normalized != "" {
		return []string{normalized}
	}
	return nil
}

func normalizedIdentity(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func fieldValueAsIdentity(v any) string {
	switch t := v.(type) {
	case string:
		return normalizedIdentity(t)
	case float64:
		return normalizedIdentity(strconv.FormatInt(int64(t), 10))
	case int:
		return normalizedIdentity(strconv.Itoa(t))
	case int64:
		return normalizedIdentity(strconv.FormatInt(t, 10))
	default:
		if v == nil {
			return ""
		}
		return normalizedIdentity(fmt.Sprint(v))
	}
}

func buildFieldScopeFilter(candidates []string, fieldName string) *model.SearchFilter {
	var conditions []model.SearchFilter
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		conditions = append(conditions, model.EqFilter(fieldName, candidate))
	}
	switch len(conditions) {
	case 0:
		return nil
	case 1:
		return &conditions[0]
	default:
		return &model.SearchFilter{Operator: "OR", Conditions: conditions}
	}
}

func isAllowedSelfCSMAccountsAccess(isUpdate bool, params map[string]any, filter model.SearchFilter, ctx *UserAccessContext) bool {
	if ctx.IsDev || !ctx.IsAdmin {
		return false
	}
	eqValues := collectEqValues(filter)
	hasSelfIdentity := matchesEqCandidate(eqValues, ctx.OwnerCandidates, []string{
		"id", "username", "email", "phoneNumber", "phone_number", "app_token", "appToken", "source_app_token",
	})
	if !isUpdate {
		return hasSelfIdentity
	}
	cmd, _ := params["command"].(string)
	if strings.ToLower(cmd) != "update" {
		return false
	}
	objUpdate, ok := params["obj_update"].(map[string]any)
	if !ok || len(objUpdate) == 0 {
		return false
	}
	return hasSelfIdentity
}

func matchesEqCandidate(eqValues map[string]string, candidates, fields []string) bool {
	if len(eqValues) == 0 || len(candidates) == 0 {
		return false
	}
	candidateSet := make(map[string]struct{}, len(candidates))
	for _, c := range candidates {
		candidateSet[normalizedIdentity(c)] = struct{}{}
	}
	for _, field := range fields {
		if value, ok := eqValues[field]; ok {
			if _, ok := candidateSet[normalizedIdentity(value)]; ok {
				return true
			}
		}
	}
	return false
}

func collectEqValues(filter model.SearchFilter) map[string]string {
	out := make(map[string]string)
	collectEqValuesInner(filter, out)
	return out
}

func collectEqValuesInner(filter model.SearchFilter, out map[string]string) {
	if len(filter.Conditions) > 0 {
		for _, condition := range filter.Conditions {
			collectEqValuesInner(condition, out)
		}
		return
	}
	if !strings.EqualFold(filter.FilterType, "eq") || filter.Field == "" {
		return
	}
	if normalized := normalizeEqFilterValue(filter.Value); normalized != "" {
		if _, ok := out[filter.Field]; !ok {
			out[filter.Field] = normalized
		}
	}
}

func normalizeEqFilterValue(v any) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case float64:
		return strconv.FormatInt(int64(t), 10)
	case bool:
		return strconv.FormatBool(t)
	default:
		if v == nil {
			return ""
		}
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func isPTypeZero(v any) bool {
	switch t := v.(type) {
	case float64:
		return int64(t) == 0
	case int:
		return t == 0
	case int64:
		return t == 0
	case string:
		return isPTypeZeroStr(t)
	case bool:
		return !t
	default:
		return false
	}
}

func isPTypeZeroStr(raw string) bool {
	raw = strings.TrimSpace(raw)
	return raw == "0" || raw == ""
}

func resolveAutosetupEffectiveAppID(ctx *UserAccessContext, requestedPName string) string {
	requested := strings.TrimSpace(requestedPName)
	if ctx.AppID != "" && (requested == "" || isSameOrBroadcastVariant(ctx.AppID, requested)) {
		return ctx.AppID
	}
	if target := autosetupTargetAppFromPName(requested); target != "" {
		if hasLegacyFullAppScope(ctx.MenusPermissions, target) {
			return target
		}
		if ctx.CanAccessAppData(target) && (ctx.IsAdmin || ctx.IsDev) {
			return target
		}
		for _, app := range ctx.DataAppIDs {
			if strings.EqualFold(app, target) {
				return target
			}
		}
		if primary := resolvePrimaryAppIDFromMenus(ctx.MenusPermissions); primary != "" && isSameOrBroadcastVariant(primary, requested) {
			return primary
		}
	}
	return ctx.AppID
}

func autosetupTargetAppFromPName(requestedPName string) string {
	requested := strings.TrimSpace(requestedPName)
	if requested == "" {
		return ""
	}
	if app, ok := strings.CutPrefix(requested, "broadcast_"); ok {
		return strings.TrimSpace(app)
	}
	return requested
}

func isSameOrBroadcastVariant(userAppID, requested string) bool {
	user := strings.TrimSpace(userAppID)
	requested = strings.TrimSpace(requested)
	if user == "" || requested == "" {
		return false
	}
	if strings.EqualFold(user, requested) {
		return true
	}
	if suffix, ok := strings.CutPrefix(user, "broadcast_"); ok {
		return strings.EqualFold(suffix, requested)
	}
	if suffix, ok := strings.CutPrefix(requested, "broadcast_"); ok {
		return strings.EqualFold(suffix, user)
	}
	return false
}

func filterManagedAccountDescendants(tableName string, rows []map[string]any, access *UserAccessContext, appID string, rm *data.RecordManager) []map[string]any {
	if tableName != "csm_accounts" || len(rows) == 0 || access.IsDev {
		return rows
	}
	visible := resolveManagedAccountVisibleIDSet(appID, access, rm)
	if len(visible) == 0 {
		return nil
	}
	var out []map[string]any
	for _, row := range rows {
		if visible[fieldValueAsIdentity(row["id"])] {
			out = append(out, row)
		}
	}
	return out
}

func resolveManagedAccountVisibleIDSet(appID string, access *UserAccessContext, rm *data.RecordManager) map[string]bool {
	if access.IsDev || len(access.OwnerCandidates) == 0 {
		return nil
	}
	allRowsResult := rm.Filter(appID, "csm_accounts", model.SearchFilter{})
	rows := rowsAsMaps(allRowsResult["rows"])
	return buildManagedAccountVisibleIDSet(rows, access)
}

func buildManagedAccountVisibleIDSet(rows []map[string]any, access *UserAccessContext) map[string]bool {
	visible := make(map[string]bool)
	if len(rows) == 0 || len(access.OwnerCandidates) == 0 {
		return visible
	}
	reachableParents := make(map[string]bool)
	for _, c := range access.OwnerCandidates {
		reachableParents[c] = true
	}
	changed := true
	for changed {
		changed = false
		for _, row := range rows {
			if isSelfManagedAccountRow(row, access) {
				selfID := fieldValueAsIdentity(row["id"])
				if selfID != "" && !visible[selfID] {
					visible[selfID] = true
					changed = true
				}
				for _, key := range []string{"id", "username", "email", "phoneNumber", "app_token"} {
					if collectCandidate(reachableParents, row[key]) {
						changed = true
					}
				}
			}
			parent := fieldValueAsIdentity(row["parent_account_id"])
			if parent == "" || !reachableParents[parent] {
				continue
			}
			rowID := fieldValueAsIdentity(row["id"])
			if rowID == "" || visible[rowID] {
				continue
			}
			visible[rowID] = true
			changed = true
			for _, key := range []string{"id", "username", "email", "phoneNumber"} {
				if collectCandidate(reachableParents, row[key]) {
					changed = true
				}
			}
		}
	}
	return visible
}

func isSelfManagedAccountRow(row map[string]any, access *UserAccessContext) bool {
	for _, key := range []string{"id", "username", "email", "phoneNumber", "app_token"} {
		if containsIdentity(access.OwnerCandidates, fieldValueAsIdentity(row[key])) {
			return true
		}
	}
	return false
}

func collectCandidate(target map[string]bool, value any) bool {
	normalized := fieldValueAsIdentity(value)
	if normalized == "" || target[normalized] {
		return false
	}
	target[normalized] = true
	return true
}

func containsIdentity(candidates []string, value string) bool {
	for _, c := range candidates {
		if c == value {
			return true
		}
	}
	return false
}

func isOwnedSubUserRow(row map[string]any, access *UserAccessContext) bool {
	parent, _ := row["parent_account_id"].(string)
	if parent == "" || len(access.ParentAccountCandidates) == 0 {
		return false
	}
	for _, candidate := range access.ParentAccountCandidates {
		if strings.EqualFold(candidate, parent) {
			return true
		}
	}
	return false
}

func isDataScopeExemptTable(tableName string) bool {
	switch tableName {
	case "index", "csm_accounts", "csm_group_members", "csm_roles", "csm_permissions",
		"csm_role_permissions", "csm_user_roles", "csm_user_depts", "csm_depts", "csm_menu", "sys_autos":
		return true
	default:
		return false
	}
}

func applyDataScopeRowFilter(tableName string, rows []map[string]any, access *UserAccessContext) []map[string]any {
	if len(rows) == 0 || access.IsDev || isDataScopeExemptTable(tableName) {
		return rows
	}
	scope := strings.ToUpper(access.DataScope)
	if scope == "ALL" || scope == "NONE" {
		return rows
	}
	var out []map[string]any
	for _, row := range rows {
		if rowMatchesDataScope(row, access) {
			out = append(out, row)
		}
	}
	return out
}

var ownerScopeFields = []string{"created_by", "create_by", "owner_id", "owner", "user_id", "userid", "account_id", "parent_account_id"}
var departmentScopeFields = []string{"dept_id", "department_id", "team_id"}
var branchScopeFields = []string{"branch_id", "branchId"}

func rowMatchesDataScope(row map[string]any, access *UserAccessContext) bool {
	switch strings.ToUpper(access.DataScope) {
	case "OWNER":
		return matchesByFields(row, ownerScopeFields, access.OwnerCandidates)
	case "DEPARTMENT":
		return matchesByFields(row, departmentScopeFields, access.DepartmentCandidates)
	case "BRANCH":
		return matchesByFields(row, branchScopeFields, access.BranchCandidates)
	default:
		return true
	}
}

func matchesByFields(row map[string]any, fields, allowed []string) bool {
	if len(allowed) == 0 {
		return false
	}
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, v := range allowed {
		allowedSet[v] = struct{}{}
	}
	for _, field := range fields {
		if normalized := fieldValueAsIdentity(row[field]); normalized != "" {
			if _, ok := allowedSet[normalized]; ok {
				return true
			}
		}
	}
	return false
}

func filterMainAccountRows(tableName string, rows []map[string]any, rm *data.RecordManager) []map[string]any {
	if tableName != "csm_accounts" || len(rows) == 0 {
		return rows
	}
	var out []map[string]any
	for _, row := range rows {
		role := extractRoleFromAppToken(row["app_token"], rm)
		if !strings.EqualFold(role, "user") {
			out = append(out, row)
		}
	}
	return out
}

func extractRoleFromAppToken(value any, rm *data.RecordManager) string {
	token, _ := value.(string)
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	return util.ParseAppToken(rm, token).Role
}

func maskSelfAccountRowsForNonDev(rows []map[string]any, access *UserAccessContext) []map[string]any {
	if len(rows) == 0 || access.IsDev {
		return rows
	}
	keep := []string{"id", "username", "email", "phoneNumber", "full_name", "avatar", "app_id", "app_token", "user_address"}
	var out []map[string]any
	for _, row := range rows {
		masked := make(map[string]any, len(keep))
		for _, key := range keep {
			if v, ok := row[key]; ok {
				masked[key] = v
			}
		}
		out = append(out, masked)
	}
	return out
}

func decryptPassForDisplay(tableName string, rows []map[string]any, rm *data.RecordManager) {
	if tableName != "csm_accounts" && tableName != "csm_group_members" {
		return
	}
	for _, row := range rows {
		pass, _ := row["pass"].(string)
		if pass == "" {
			continue
		}
		if decrypted, err := rm.CsmDecrypt(pass); err == nil {
			if _, raw, ok := strings.Cut(decrypted, "_____"); ok {
				row["pass"] = raw
			} else {
				row["pass"] = decrypted
			}
		}
	}
}

func rowsAsMaps(value any) []map[string]any {
	arr, ok := value.([]any)
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
