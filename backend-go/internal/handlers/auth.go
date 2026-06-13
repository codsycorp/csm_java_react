package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/services"
)

type AuthHandler struct {
	rm  *data.RecordManager
	us  *services.UserService
	jwt *security.JWTUtil
}

func NewAuthHandler(rm *data.RecordManager, us *services.UserService, jwt *security.JWTUtil) *AuthHandler {
	return &AuthHandler{rm: rm, us: us, jwt: jwt}
}

func (h *AuthHandler) HandleLogin(params map[string]any) *model.StandardResponse {
	resp := model.NewResponse()
	loginID := firstString(params, "email", "username", "phone")
	password, _ := params["password"].(string)
	if loginID == "" || password == "" {
		resp.Set("code", 400)
		resp.Set("success", false)
		resp.Set("message", "Vui lòng cung cấp Email, Tên đăng nhập hoặc Số điện thoại và Mật khẩu.")
		return resp
	}

	user := h.us.FindByLoginAndPassword(loginID, password)
	if user == nil {
		resp.Set("code", 401)
		resp.Set("success", false)
		resp.Set("message", "Định danh hoặc mật khẩu không hợp lệ")
		return resp
	}

	h.us.FinalizeSessionProfile(user)
	isDev := user.Dev != nil && *user.Dev
	nextVersion := 1
	if user.LoginVersion != nil {
		nextVersion = *user.LoginVersion + 1
	}
	refreshToken := uuid.NewString() + uuid.NewString()
	ip, _ := params["_client_ip"].(string)
	ua, _ := params["_user_agent"].(string)
	clientID := sessionClientIDFromParams(params)
	expiry := time.Now().UnixMilli() + 7*24*60*60*1000

	h.us.UpdateSessionToken(user, refreshToken, security.NormalizeClientIP(ip), security.NormalizeUserAgent(ua), expiry, nextVersion, clientID)

	tokenSubject := deref(user.AppToken)
	if tokenSubject == "" {
		tokenSubject = deref(user.ID)
	}
	jwtToken := h.jwt.GenerateTokenWithUID(tokenSubject, deref(user.ID), nextVersion)
	csrf := uuid.NewString()

	result := map[string]any{
		"token":        jwtToken,
		"refreshToken": refreshToken,
		"csrfToken":    csrf,
		"dev":          isDev,
	}
	copyIfSet(result, "app_token", user.AppToken)
	copyIfSet(result, "app_id", user.AppID)
	copyIfSet(result, "userId", user.ID)
	copyIfSet(result, "username", user.Username)
	copyIfSet(result, "email", user.Email)
	copyIfSet(result, "phoneNumber", user.PhoneNumber)
	copyIfSet(result, "full_name", user.FullName)
	copyIfSet(result, "avatar", user.Avatar)
	if len(user.UserAddress) > 0 {
		var addr any
		if err := json.Unmarshal(user.UserAddress, &addr); err == nil {
			result["user_address"] = addr
			result["user_adress"] = addr
		}
	}

	enrichAccountMeta(h.rm, user, result)
	enrichAsyncRoutes(h.rm, user, result)
	result["dev"] = isDev

	resp.Set("code", 200)
	resp.Set("success", true)
	resp.Set("message", "ok")
	resp.Set("result", result)
	appendAuthCookies(resp, params, refreshToken, csrf)
	log.Printf("[LOGIN] User authenticated: %s", loginID)
	return resp
}

func (h *AuthHandler) HandleUserInfo(auth *security.AuthUser, params map[string]any) *model.StandardResponse {
	resp := model.NewResponse()
	clientIP, clientUA, clientID := sessionContextFromParams(params)

	if rt, ok := params["refreshTokenHeader"].(string); ok && rt != "" {
		if user := h.us.FindUserByRefreshToken(rt, false); user != nil {
			if security.RefreshSessionValid(*user, clientIP, clientUA, clientID) {
				if token, ok := params["csm-token"].(string); ok && token != "" {
					if !security.UserMatchesCSMToken(h.jwt, token, *user) {
						resp.Set("code", 401)
						resp.Set("success", false)
						resp.Set("message", "Session token mismatch")
						return resp
					}
				}
				h.finishUserInfoResponse(user, resp)
				return resp
			}
		}
		resp.Set("code", 401)
		resp.Set("success", false)
		resp.Set("message", "Invalid or expired refresh token")
		return resp
	}

	if token, ok := params["csm-token"].(string); ok && token != "" {
		if h.jwt.ValidateToken(token) {
			if user := h.us.ResolveFromJWT(h.jwt, token); user != nil {
				if claims, err := h.jwt.ParseClaims(token); err == nil {
					if !security.UserMatchesJWTHints(*user, claims.UID, claims.Sub) {
						resp.Set("code", 401)
						resp.Set("success", false)
						resp.Set("message", "Session token mismatch")
						return resp
					}
				}
				h.finishUserInfoResponse(user, resp)
				return resp
			}
		} else if auth == nil {
			resp.Set("code", 401)
			resp.Set("success", false)
			resp.Set("message", "Invalid or expired session token")
			return resp
		}
	}

	if auth == nil {
		resp.Set("code", 401)
		resp.Set("success", false)
		resp.Set("message", "Not authenticated")
		return resp
	}

	user := h.us.CanonicalizeSessionUser(*auth)
	if user == nil {
		user = authUserToModel(*auth)
	}
	if token, ok := params["csm-token"].(string); ok && token != "" {
		if !security.UserMatchesCSMToken(h.jwt, token, *user) {
			resp.Set("code", 401)
			resp.Set("success", false)
			resp.Set("message", "Session token mismatch")
			return resp
		}
	}
	h.finishUserInfoResponse(user, resp)
	return resp
}

func (h *AuthHandler) HandleRefreshToken(params map[string]any) *model.StandardResponse {
	resp := model.NewResponse()
	refreshToken, _ := params["refreshToken"].(string)
	if refreshToken == "" {
		if v, ok := params["refreshTokenHeader"].(string); ok {
			refreshToken = v
		}
	}
	clientIP, clientUA, clientID := sessionContextFromParams(params)
	user := h.us.FindUserByRefreshToken(refreshToken, true)
	if user == nil || !security.RefreshSessionValidForEndpoint(*user, clientIP, clientUA) {
		resp.Set("code", 401)
		resp.Set("success", false)
		resp.Set("message", "Invalid refresh token")
		return resp
	}

	version := derefInt(user.LoginVersion)
	newRefresh := uuid.NewString() + uuid.NewString()
	expiry := time.Now().UnixMilli() + 7*24*60*60*1000
	h.us.UpdateSessionToken(user, newRefresh, clientIP, clientUA, expiry, version, clientID)

	tokenSubject := deref(user.AppToken)
	if tokenSubject == "" {
		tokenSubject = deref(user.ID)
	}
	jwtToken := h.jwt.GenerateTokenWithUID(tokenSubject, deref(user.ID), version)
	csrf := uuid.NewString()

	resp.Set("code", 200)
	resp.Set("success", true)
	resp.Set("result", map[string]any{
		"token":        jwtToken,
		"refreshToken": newRefresh,
		"csrfToken":    csrf,
		"app_token":    user.AppToken,
	})
	appendAuthCookies(resp, params, newRefresh, csrf)
	return resp
}

func (h *AuthHandler) HandleLogout(auth *security.AuthUser, params map[string]any) *model.StandardResponse {
	resp := model.NewResponse()
	if auth != nil {
		user := h.us.CanonicalizeSessionUser(*auth)
		if user == nil {
			user = authUserToModel(*auth)
		}
		h.us.ClearSessionToken(user)
	}
	clearAuthCookies(resp, params)
	resp.Set("code", 200)
	resp.Set("success", true)
	resp.Set("message", "ok")
	return resp
}

func (h *AuthHandler) HandleRegister(params map[string]any) *model.StandardResponse {
	result := h.us.RegisterUser(params)
	resp := model.NewResponse()
	if result.Success {
		resp.Set("code", 200)
		resp.Set("success", true)
		resp.Set("message", result.Message)
	} else {
		resp.Set("code", 400)
		resp.Set("success", false)
		resp.Set("message", result.ErrorMessage)
		if result.ErrorCode > 0 {
			resp.Set("errorCode", result.ErrorCode)
		}
	}
	return resp
}

func (h *AuthHandler) HandleCreateSubUser(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	result := h.us.CreateSubUser(params, auth)
	resp := model.NewResponse()
	if result.Success {
		resp.Set("code", 200)
		resp.Set("success", true)
		resp.Set("message", result.Message)
		if result.UserID != "" {
			resp.Set("result", map[string]any{"userId": result.UserID})
		}
	} else {
		resp.Set("code", 400)
		resp.Set("success", false)
		resp.Set("message", result.ErrorMessage)
	}
	return resp
}

func (h *AuthHandler) HandleGetAsyncRoutes(auth *security.AuthUser) *model.StandardResponse {
	resp := model.NewResponse()
	if auth == nil {
		resp.Set("code", 401)
		resp.Set("success", false)
		resp.Set("message", "Not authenticated")
		return resp
	}
	index := h.rm.Find(services.CSMAppID, "index", model.EqFilter("id", "accessRights"))
	var rows []any
	if dataArr, ok := index["data"].([]any); ok {
		rows = dataArr
	}
	filtered := filterRoutesByRole(rows, auth)
	resp.Set("code", 200)
	resp.Set("success", true)
	resp.Set("message", "ok")
	resp.Set("result", filtered)
	return resp
}

func (h *AuthHandler) finishUserInfoResponse(user *model.User, resp *model.StandardResponse) {
	result := userInfoMapFromUser(user)
	enrichAccountMeta(h.rm, user, result)
	enrichUserInfoWithBitfield(result)
	resp.Set("code", 200)
	resp.Set("success", true)
	resp.Set("message", "ok")
	resp.Set("result", result)
}

func filterRoutesByRole(allRoutes []any, auth *security.AuthUser) []any {
	if auth == nil {
		return nil
	}
	if auth.Dev {
		return allRoutes
	}
	userRole := ""
	if len(auth.Permissions) > 0 {
		userRole = auth.Permissions[0]
	}
	if userRole == "" {
		return nil
	}
	menuPaths := auth.MenusPermissions
	if menuPaths == nil {
		menuPaths = []string{}
	}
	seen := make(map[string]struct{})
	return filterRoutesByRoleAndMenus(allRoutes, userRole, menuPaths, auth.Dev, seen)
}

// filterRoutesByRoleAndMenus mirrors Java AuthHandler.filterRoutesByRoleAndMenus.
func filterRoutesByRoleAndMenus(routes []any, userRole string, allowedMenuPaths []string, isDev bool, seenPaths map[string]struct{}) []any {
	if routes == nil {
		return nil
	}
	menuSet := make(map[string]struct{}, len(allowedMenuPaths))
	for _, path := range allowedMenuPaths {
		menuSet[path] = struct{}{}
	}
	var out []any
	for _, item := range routes {
		route, ok := item.(map[string]any)
		if !ok {
			continue
		}
		path, _ := route["path"].(string)
		if path == "" {
			continue
		}
		if _, seen := seenPaths[path]; seen {
			continue
		}
		seenPaths[path] = struct{}{}

		current := copyMap(route)
		if children, ok := route["children"].([]any); ok {
			current["children"] = filterRoutesByRoleAndMenus(children, userRole, allowedMenuPaths, isDev, seenPaths)
		}

		handle, _ := route["handle"].(map[string]any)
		roles := stringListFromAny(handle["roles"])
		if len(roles) == 0 {
			roles = stringListFromAny(route["roles"])
		}

		hasRoleAccess := false
		for _, role := range roles {
			if role == userRole {
				hasRoleAccess = true
				break
			}
		}

		hasMenuAccess := false
		if _, ok := menuSet[path]; ok {
			hasMenuAccess = true
		}

		isSystemRoute := path == "/system" || strings.HasPrefix(path, "/system/")
		isDevOnlySystemPath := isDevOnlySystemRoute(path)
		isAdminSystemAccess := userRole == "admin" && isSystemRoute && !isDevOnlySystemPath

		hasChildren := false
		if children, ok := current["children"].([]any); ok && len(children) > 0 {
			hasChildren = true
		}

		include := false
		if isSystemRoute {
			include = isDev || hasRoleAccess || isAdminSystemAccess || hasChildren
		} else {
			include = hasRoleAccess || hasMenuAccess || hasChildren
		}
		if include {
			out = append(out, current)
		}
	}
	return out
}

func isDevOnlySystemRoute(path string) bool {
	for _, prefix := range []string{"/system/menu", "/system/developer", "/system/broadcast"} {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return false
}

func appendAuthCookies(resp *model.StandardResponse, params map[string]any, refreshToken, csrf string) {
	host, _ := params["_host"].(string)
	origin, _ := params["_origin"].(string)
	isLocalhost := host == "localhost" || host == "127.0.0.1" ||
		strings.Contains(origin, "localhost") || strings.Contains(origin, "127.0.0.1")
	isCrossSite := false
	if origin != "" && host != "" && !strings.Contains(strings.ToLower(origin), strings.ToLower(host)) {
		isCrossSite = true
	}
	maxAge := 7 * 24 * 60 * 60
	expires := time.Now().Add(7 * 24 * time.Hour).UTC().Format(http.TimeFormat)
	cookieRefresh := "refreshToken=" + refreshToken + "; Path=/; HttpOnly; Max-Age=" + itoa(maxAge)
	cookieCSRF := "CSRF-TOKEN=" + csrf + "; Path=/"
	if isCrossSite && !isLocalhost {
		cookieRefresh += "; Secure; SameSite=None"
		cookieCSRF += "; SameSite=None; Secure"
	} else {
		cookieRefresh += "; SameSite=Lax"
		cookieCSRF += "; SameSite=Lax"
	}
	cookieRefresh += "; Expires=" + expires
	resp.ExtraHeaders.Add("Set-Cookie", cookieRefresh)
	resp.ExtraHeaders.Add("Set-Cookie", cookieCSRF)
}

func clearAuthCookies(resp *model.StandardResponse, params map[string]any) {
	host, _ := params["_host"].(string)
	resp.ExtraHeaders.Add("Set-Cookie", "refreshToken=; Path=/; Max-Age=0; HttpOnly")
	resp.ExtraHeaders.Add("Set-Cookie", "CSRF-TOKEN=; Path=/; Max-Age=0")
	if host != "" && strings.Contains(host, ".") {
		parts := strings.Split(host, ".")
		if len(parts) >= 2 {
			root := "." + strings.Join(parts[len(parts)-2:], ".")
			resp.ExtraHeaders.Add("Set-Cookie", "refreshToken=; Path=/; Domain="+root+"; Max-Age=0; HttpOnly")
		}
	}
}

func sessionContextFromParams(params map[string]any) (ip, ua, clientID string) {
	ip, _ = params["_client_ip"].(string)
	ua, _ = params["_user_agent"].(string)
	clientID = sessionClientIDFromParams(params)
	return security.NormalizeClientIP(ip), security.NormalizeUserAgent(ua), clientID
}

func sessionClientIDFromParams(params map[string]any) string {
	if v, ok := params["_client_id"].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func firstString(params map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := params[k].(string); ok && v != "" {
			return v
		}
	}
	return ""
}

func copyIfSet(dst map[string]any, key string, val *string) {
	if val != nil && *val != "" {
		dst[key] = *val
	}
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

func authUserToModel(auth security.AuthUser) *model.User {
	u := model.User{
		ID:               model.StrPtr(auth.UserID),
		Username:         model.StrPtr(auth.Username),
		Email:            model.StrPtr(auth.Email),
		PhoneNumber:      model.StrPtr(auth.PhoneNumber),
		AppToken:         model.StrPtr(auth.AppToken),
		AppID:            model.StrPtr(auth.AppID),
		Permissions:      auth.Permissions,
		MenusPermissions: auth.MenusPermissions,
		DataAppIDs:       auth.DataAppIDs,
		Dev:              model.BoolPtr(auth.Dev),
		IsSubUser:        model.BoolPtr(auth.IsSubUser),
		LoginVersion:     model.IntPtr(auth.LoginVersion),
	}
	return &u
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
