package services

import (
	"log"
	"strings"
	"time"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/util"
)

const (
	CSMAppID          = "csm"
	AccountsTable     = "csm_accounts"
	SubAccountsTable  = "csm_group_members"
)

type UserService struct {
	rm *data.RecordManager
}

func NewUserService(rm *data.RecordManager) *UserService {
	return &UserService{rm: rm}
}

func (s *UserService) FindByLoginAndPassword(loginID, rawPassword string) *model.User {
	for _, finder := range []func(string) (*model.User, map[string]any){
		s.findByEmail,
		s.findByUsername,
		s.findByPhone,
	} {
		user, record := finder(loginID)
		if user == nil {
			continue
		}
		field := loginField(*user, loginID)
		if s.passwordMatches(record, *user, field, rawPassword) {
			log.Printf("Login success for %s", loginID)
			return user
		}
	}

	sub := s.rm.Find(CSMAppID, SubAccountsTable, model.EqFilter("login_identifier", loginID))
	if len(sub) > 0 {
		combined := loginID + "_____" + rawPassword
		encoded := s.rm.CsmEncrypt(combined)
		pass, _ := sub["pass"].(string)
		actived, _ := sub["actived"].(bool)
		if !subHasKey(sub, "actived") {
			actived = true
		}
		if actived && pass == encoded {
			if u := s.mapSubUser(sub); u != nil {
				return u
			}
		}
	}
	return nil
}

func subHasKey(m map[string]any, key string) bool {
	_, ok := m[key]
	return ok
}

func (s *UserService) FindUserByRefreshToken(refreshToken string, canonicalize bool) *model.User {
	if refreshToken == "" {
		return nil
	}
	if s.rm != nil {
		for _, field := range []string{"refresh_token", "refresh"} {
			filter := model.EqFilter(field, refreshToken)
			filtered := s.rm.Filter(CSMAppID, AccountsTable, filter)
			rows, _ := filtered["rows"].([]any)
			var accountRows []map[string]any
			for _, row := range rows {
				if m, ok := row.(map[string]any); ok {
					accountRows = append(accountRows, m)
				}
			}
			if rec := pickBestRefreshSessionRecord(accountRows, refreshToken); rec != nil {
				if canonicalize {
					return s.canonicalizeRefreshUser(rec, refreshToken)
				}
				return s.mapRefreshRecordToUser(rec, refreshToken)
			}
			record := s.rm.Find(CSMAppID, AccountsTable, filter)
			if len(record) > 0 {
				if canonicalize {
					return s.canonicalizeRefreshUser(record, refreshToken)
				}
				return s.mapRefreshRecordToUser(record, refreshToken)
			}
			sub := s.rm.Find(CSMAppID, SubAccountsTable, filter)
			if len(sub) > 0 {
				if recordRefreshExpired(sub) {
					return nil
				}
				user := s.mapSubUser(sub)
				if user == nil {
					return nil
				}
				stored := deref(user.RefreshToken)
				if stored != refreshToken {
					return nil
				}
				return user
			}
		}
	}
	return s.lookupRefreshGraceUser(refreshToken)
}

func (s *UserService) ResolveFromJWT(jwt *security.JWTUtil, token string) *model.User {
	claims, err := jwt.ParseClaims(token)
	if err != nil {
		return nil
	}
	return s.resolveFromClaims(claims)
}

func (s *UserService) ResolveFromJWTAllowExpired(jwt *security.JWTUtil, token string) *model.User {
	claims, err := jwt.ParseClaimsAllowExpired(token)
	if err != nil {
		return nil
	}
	return s.resolveFromClaims(claims)
}

func (s *UserService) resolveFromClaims(claims *security.Claims) *model.User {
	subject := strings.TrimSpace(claims.Sub)
	tokenUserID := strings.TrimSpace(claims.UID)
	tokenVersion := claims.Ver
	if subject == "" {
		return nil
	}

	var user *model.User
	if tokenUserID != "" {
		user = s.FindByID(tokenUserID)
	}
	if user == nil {
		user = s.FindByID(subject)
		if user == nil {
			user = s.findAccountUser("email", subject)
		}
		if user == nil {
			user = s.findAccountUser("username", subject)
		}
		if user == nil {
			user = s.findAccountUser("phoneNumber", subject)
		}
		if user == nil && looksLikeAppToken(subject) && tokenUserID != "" {
			user = s.FindByAppTokenScoped(subject, tokenUserID, tokenVersion)
		} else if user == nil {
			user = s.FindByAppToken(subject)
		}
	}
	if user == nil {
		return nil
	}
	if !subjectMatchesUser(subject, *user) {
		return nil
	}
	if tokenUserID != "" && user.ID != nil && !userIDsMatch(*user.ID, tokenUserID) {
		return nil
	}
	// Mirror Java: re-fetch by app_token PK BEFORE login_version check (email-keyed rows can be stale).
	if user.AppToken != nil && *user.AppToken != "" {
		if sub := s.findSubUserByAppToken(*user.AppToken); len(sub) > 0 {
			if mapped := s.mapSubUser(sub); mapped != nil {
				user = mapped
			}
		} else if rec := s.findAppTokenPKRecord(*user.AppToken); len(rec) > 0 {
			fresh := s.mapRecordToUser(rec, true)
			user = &fresh
		} else if fresh := s.FindByAppToken(*user.AppToken); fresh != nil {
			user = fresh
		}
	}
	if user.LoginVersion != nil && *user.LoginVersion != tokenVersion && tokenVersion > 0 {
		dbVersion := *user.LoginVersion
		if dbVersion > tokenVersion {
			return nil
		}
		// DB row lagging behind freshly issued JWT (duplicate/stale records).
		lv := tokenVersion
		user.LoginVersion = &lv
	}
	return user
}

// ResolveSessionAuth re-loads the session user from DB (Java JwtAuthenticationFilter parity).
func (s *UserService) ResolveSessionAuth(auth security.AuthUser) *security.AuthUser {
	var user *model.User
	if strings.TrimSpace(auth.AppToken) != "" {
		user = s.FindByAppTokenScoped(auth.AppToken, auth.UserID, auth.LoginVersion)
		if user == nil {
			user = s.FindByAppToken(auth.AppToken)
		}
	}
	if user == nil && strings.TrimSpace(auth.UserID) != "" {
		user = s.FindByID(auth.UserID)
	}
	if user == nil {
		user = s.CanonicalizeSessionUser(auth)
	}
	if user == nil {
		return nil
	}
	au := security.AuthUserFromUser(*user, false)
	return &au
}

func (s *UserService) CanonicalizeSessionUser(auth security.AuthUser) *model.User {
	if auth.AppToken != "" {
		if u := s.FindByAppTokenScoped(auth.AppToken, auth.UserID, auth.LoginVersion); u != nil {
			return u
		}
	}
	if auth.UserID != "" {
		if u := s.FindByID(auth.UserID); u != nil {
			return u
		}
	}
	return nil
}

func (s *UserService) UpdateSessionToken(user *model.User, refreshToken, ip, ua string, expiryMs int64, loginVersion int, clientID string) {
	if user != nil {
		if old := deref(user.RefreshToken); old != "" && old != refreshToken {
			rememberRotatedRefreshToken(old, user)
		}
	}
	fields := map[string]any{
		"refresh_token":         refreshToken,
		"refresh":               refreshToken,
		"refresh_token_ip":      ip,
		"refresh_token_ua":      ua,
		"refresh_token_expiry":  expiryMs,
		"login_version":         loginVersion,
		"loginVersion":          loginVersion,
	}
	if strings.TrimSpace(clientID) != "" {
		fields["refresh_token_client_id"] = strings.TrimSpace(clientID)
		fields["refreshTokenClientId"] = strings.TrimSpace(clientID)
	}
	if !s.writeSessionFields(user, fields) {
		log.Printf("update_session_token: session not persisted for user id=%v", user.ID)
	}
}

func (s *UserService) ClearSessionToken(user *model.User) {
	fields := map[string]any{
		"refresh_token":        nil,
		"refresh":              nil,
		"refresh_token_ip":     nil,
		"refresh_token_ua":     nil,
		"refresh_token_expiry": nil,
	}
	if !s.writeSessionFields(user, fields) && user.ID != nil && *user.ID != "" {
		s.updateByID(*user.ID, fields)
	}
}

func (s *UserService) FinalizeSessionProfile(user *model.User) {
	if user.AppID == nil || *user.AppID == "" {
		if user.AppToken != nil && *user.AppToken != "" {
			if appID := extractAppIDFromToken(s.rm, *user.AppToken); appID != "" {
				user.AppID = &appID
			}
		}
	}
}

func (s *UserService) FindByID(id string) *model.User {
	if id == "" {
		return nil
	}
	record := s.rm.Find(CSMAppID, AccountsTable, model.EqFilter("id", id))
	if len(record) == 0 {
		record = s.rm.Find(CSMAppID, SubAccountsTable, model.EqFilter("id", id))
		if len(record) == 0 {
			return nil
		}
		return s.mapSubUser(record)
	}
	u := s.mapRecordToUser(record, true)
	return &u
}

func (s *UserService) FindByAppToken(appToken string) *model.User {
	if appToken == "" {
		return nil
	}
	record := s.findAppTokenPKRecord(appToken)
	if len(record) == 0 {
		record = s.rm.Find(CSMAppID, AccountsTable, model.EqFilter("app_token", appToken))
	}
	if len(record) == 0 {
		if sub := s.findSubUserByAppToken(appToken); len(sub) > 0 {
			return s.mapSubUser(sub)
		}
		return nil
	}
	u := s.mapRecordToUser(record, true)
	return &u
}

func (s *UserService) FindByAppTokenScoped(appToken, userID string, loginVersion int) *model.User {
	record := s.findAppTokenPKRecord(appToken)
	if len(record) == 0 {
		record = s.rm.Find(CSMAppID, AccountsTable, model.EqFilter("app_token", appToken))
	}
	if len(record) == 0 {
		if sub := s.findSubUserByAppToken(appToken); len(sub) > 0 {
			user := s.mapSubUser(sub)
			if user == nil {
				return nil
			}
			if userID != "" && user.ID != nil && !userIDsMatch(*user.ID, userID) {
				return nil
			}
			if loginVersion > 0 && user.LoginVersion != nil && *user.LoginVersion != loginVersion {
				return nil
			}
			return user
		}
		return nil
	}
	u := s.mapRecordToUser(record, true)
	if userID != "" && u.ID != nil && !userIDsMatch(*u.ID, userID) {
		return nil
	}
	if loginVersion > 0 && u.LoginVersion != nil && *u.LoginVersion != loginVersion {
		return nil
	}
	return &u
}

func (s *UserService) findAccountUser(field, value string) *model.User {
	user, _ := s.findAccount(field, value)
	return user
}

func (s *UserService) findAccount(field, value string) (*model.User, map[string]any) {
	record := s.rm.Find(CSMAppID, AccountsTable, model.EqFilter(field, value))
	if len(record) == 0 {
		return nil, nil
	}
	u := s.mapRecordToUser(record, true)
	return &u, record
}

func (s *UserService) findByEmail(email string) (*model.User, map[string]any) {
	return s.findAccount("email", email)
}

func (s *UserService) findByUsername(username string) (*model.User, map[string]any) {
	return s.findAccount("username", username)
}

func (s *UserService) findByPhone(phone string) (*model.User, map[string]any) {
	return s.findAccount("phoneNumber", phone)
}

func (s *UserService) passwordMatches(record map[string]any, user model.User, loginField, rawPassword string) bool {
	combined := loginField + "_____" + rawPassword
	encoded := s.rm.CsmEncrypt(combined)
	stored, _ := record["pass"].(string)
	if stored == "" {
		stored, _ = record["password"].(string)
	}
	if stored == "" && user.Password != nil {
		stored = *user.Password
	}
	actived, ok := record["actived"].(bool)
	if !ok && user.Actived != nil {
		actived = *user.Actived
	} else if !ok {
		actived = true
	}
	return actived && stored == encoded
}

func (s *UserService) mapRecordToUser(record map[string]any, isMainAccount bool) model.User {
	user := model.UserFromRecord(record)
	if user.AppID == nil || *user.AppID == "" {
		if user.AppToken != nil {
			if appID := extractAppIDFromToken(s.rm, *user.AppToken); appID != "" {
				user.AppID = &appID
			}
		}
	}
	s.normalizeMainAccountUser(&user, record, isMainAccount)
	return user
}

// normalizeMainAccountUser mirrors Java UserService.mapMainAccountToUser session/profile enrichment.
func (s *UserService) normalizeMainAccountUser(user *model.User, record map[string]any, isMainAccount bool) {
	if user == nil {
		return
	}
	meta := util.ParseAppToken(s.rm, deref(user.AppToken))
	isDev := meta.AccessRight > 0
	user.Dev = &isDev

	permissions := append([]string{}, user.Permissions...)
	menusPermissions := append([]string{}, user.MenusPermissions...)
	if user.PermissionBitfield != nil && *user.PermissionBitfield != "" {
		permissions = util.MergeUniqueCaseInsensitive(permissions, util.PermissionsFromBitfield(*user.PermissionBitfield))
		menusPermissions = util.MergeUniqueCaseInsensitive(menusPermissions, util.MenusFromBitfield(*user.PermissionBitfield))
	}

	appID := deref(user.AppID)
	if appID == "" {
		appID = strings.TrimSpace(meta.AppID)
		if appID != "" {
			user.AppID = &appID
		}
	}

	isSubUserToken := util.IsSubUserRole(meta.Role)
	if isDev {
		permissions = util.MergeUniqueCaseInsensitive(permissions, []string{"dev", "admin", "scope:all"})
		if appID != "" {
			menusPermissions = []string{appID}
		}
	} else if isMainAccount && !isSubUserToken {
		permissions = util.MergeUniqueCaseInsensitive(permissions, []string{
			"admin", "scope:all", "view", "create", "edit", "delete", "export",
		})
		if len(menusPermissions) == 0 && appID != "" {
			menusPermissions = []string{appID}
		}
	}

	user.Permissions = permissions
	user.MenusPermissions = menusPermissions

	bitfield := util.BuildBitfield(permissions, menusPermissions, isDev)
	token := util.ToCompactToken(bitfield)
	user.PermissionBitfield = &token
	schema := util.SchemaV3
	user.PermissionSchemaVer = &schema
	dataScope := util.ResolveDataScope(bitfield)
	user.DataScope = &dataScope

	isSubUser := isSubUserToken
	if !isMainAccount {
		isSubUser = true
	}
	user.IsSubUser = &isSubUser

	if isSubUser {
		user.DataAppIDs = []string{}
	} else {
		user.DataAppIDs = ResolveEffectiveDataAppIds(record, appID)
	}

	if record != nil {
		if dept, ok := record["dept_id"].(string); ok && dept != "" {
			user.DeptID = &dept
		}
		if branch, ok := record["branch_id"].(string); ok && branch != "" {
			user.BranchID = &branch
		}
	}
}

func (s *UserService) mapRefreshRecordToUser(record map[string]any, refreshToken string) *model.User {
	if recordRefreshExpired(record) {
		return nil
	}
	stored, _ := record["refresh_token"].(string)
	if stored == "" {
		stored, _ = record["refresh"].(string)
	}
	if stored != refreshToken {
		return nil
	}
	u := s.mapRecordToUser(record, true)
	return &u
}

func (s *UserService) canonicalizeRefreshUser(record map[string]any, refreshToken string) *model.User {
	user := s.mapRefreshRecordToUser(record, refreshToken)
	if user == nil {
		return nil
	}
	if user.AppToken != nil && *user.AppToken != "" {
		if canonical := s.FindByAppTokenScoped(*user.AppToken, deref(user.ID), derefInt(user.LoginVersion)); canonical != nil {
			if canonical.RefreshToken != nil && *canonical.RefreshToken == refreshToken {
				return canonical
			}
		}
	}
	return user
}

func (s *UserService) writeSessionFields(user *model.User, fields map[string]any) bool {
	syncSessionFieldAliases(fields)

	if user.IsSubUser != nil && *user.IsSubUser && user.ID != nil && *user.ID != "" {
		return s.updateSubUserFieldByID(*user.ID, fields)
	}

	if user.ID != nil && *user.ID != "" {
		if s.updateSubUserFieldByID(*user.ID, fields) {
			return true
		}
	}

	// Mirror Rust/Java: persist session on app_token PK first (authoritative row after login).
	if user.AppToken != nil && *user.AppToken != "" {
		appToken := *user.AppToken
		record := s.findAppTokenPKRecord(appToken)
		if len(record) == 0 {
			record = s.rm.Find(CSMAppID, AccountsTable, model.EqFilter("app_token", appToken))
		}
		if len(record) == 0 {
			record = map[string]any{"app_token": appToken}
			if user.ID != nil {
				record["id"] = *user.ID
			}
		}
		for k, v := range fields {
			record[k] = v
		}
		if _, err := s.rm.CreateRecord(CSMAppID, AccountsTable, record, []string{"app_token"}); err == nil {
			if user.ID != nil && *user.ID != "" {
				s.updateByID(*user.ID, fields)
			}
			return true
		}
	}

	if user.ID != nil && *user.ID != "" {
		return s.updateByID(*user.ID, fields)
	}
	return false
}

func (s *UserService) findAppTokenPKRecord(appToken string) map[string]any {
	if appToken == "" {
		return nil
	}
	return s.rm.FindByCustomPK(CSMAppID, AccountsTable, map[string]any{"app_token": appToken}, []string{"app_token"})
}

func syncSessionFieldAliases(fields map[string]any) {
	if rt, ok := fields["refresh_token"]; ok {
		fields["refresh"] = rt
	}
	if rt, ok := fields["refresh"]; ok {
		fields["refresh_token"] = rt
	}
	if lv, ok := fields["login_version"]; ok {
		fields["loginVersion"] = lv
	}
	if lv, ok := fields["loginVersion"]; ok {
		fields["login_version"] = lv
	}
}

func (s *UserService) findAccountRecordForSession(user *model.User) map[string]any {
	for _, spec := range []struct {
		field string
		value string
	}{
		{"app_token", deref(user.AppToken)},
		{"id", deref(user.ID)},
		{"email", deref(user.Email)},
		{"username", deref(user.Username)},
	} {
		if spec.value == "" {
			continue
		}
		if rec := s.rm.Find(CSMAppID, AccountsTable, model.EqFilter(spec.field, spec.value)); len(rec) > 0 {
			return rec
		}
	}
	return nil
}

func (s *UserService) updateSubUserFieldByID(id string, fields map[string]any) bool {
	record := s.rm.Find(CSMAppID, SubAccountsTable, model.EqFilter("id", id))
	if len(record) == 0 {
		return false
	}
	for k, v := range fields {
		record[k] = v
	}
	_, err := s.rm.CreateRecord(CSMAppID, SubAccountsTable, record, []string{"id"})
	return err == nil
}

func (s *UserService) updateByID(id string, fields map[string]any) bool {
	record := s.rm.Find(CSMAppID, AccountsTable, model.EqFilter("id", id))
	if len(record) == 0 {
		return false
	}
	for k, v := range fields {
		record[k] = v
	}
	_, err := s.rm.CreateRecord(CSMAppID, AccountsTable, record, []string{"id"})
	return err == nil
}

func recordRefreshExpired(record map[string]any) bool {
	expiry := int64(0)
	if v, ok := record["refresh_token_expiry"].(float64); ok {
		expiry = int64(v)
	} else if v, ok := record["refresh_token_expiry"].(int64); ok {
		expiry = v
	} else if v, ok := record["refresh_token_expiry"].(int); ok {
		expiry = int64(v)
	}
	if expiry <= 0 {
		return false
	}
	return expiry <= time.Now().UnixMilli()
}

func pickBestRefreshSessionRecord(rows []map[string]any, refreshToken string) map[string]any {
	var best map[string]any
	var bestExpiry int64
	for _, row := range rows {
		stored, _ := row["refresh_token"].(string)
		if stored == "" {
			stored, _ = row["refresh"].(string)
		}
		if stored != refreshToken || recordRefreshExpired(row) {
			continue
		}
		expiry := int64(0)
		if v, ok := row["refresh_token_expiry"].(float64); ok {
			expiry = int64(v)
		}
		if expiry >= bestExpiry {
			bestExpiry = expiry
			best = row
		}
	}
	return best
}

func loginField(user model.User, loginID string) string {
	if user.Email != nil && strings.EqualFold(*user.Email, loginID) {
		return *user.Email
	}
	if user.Username != nil && strings.EqualFold(*user.Username, loginID) {
		return *user.Username
	}
	if user.PhoneNumber != nil && *user.PhoneNumber == loginID {
		return *user.PhoneNumber
	}
	return loginID
}

func subjectMatchesUser(subject string, user model.User) bool {
	if user.AppToken != nil && *user.AppToken == subject {
		return true
	}
	if user.ID != nil && *user.ID == subject {
		return true
	}
	if user.Email != nil && strings.EqualFold(*user.Email, subject) {
		return true
	}
	if user.Username != nil && strings.EqualFold(*user.Username, subject) {
		return true
	}
	if user.PhoneNumber != nil && *user.PhoneNumber == subject {
		return true
	}
	return false
}

func userIDsMatch(a, b string) bool {
	return strings.TrimSpace(a) == strings.TrimSpace(b)
}

func looksLikeAppToken(s string) bool {
	return len(s) > 20 && strings.Contains(s, ".")
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

func extractAppIDFromToken(rm *data.RecordManager, appToken string) string {
	decrypted, err := rm.CsmDecrypt(appToken)
	if err != nil {
		return ""
	}
	parts := strings.Split(decrypted, "_____")
	if len(parts) > 0 {
		return parts[0]
	}
	return ""
}

type RegistrationResult struct {
	Success      bool
	Message      string
	ErrorMessage string
	ErrorCode    int
	UserID       string
}

func (s *UserService) RegisterUser(req map[string]any) RegistrationResult {
	email, _ := req["email"].(string)
	username, _ := req["username"].(string)
	phone, _ := req["phoneNumber"].(string)
	rawPassword, _ := req["password"].(string)
	if email == "" && username == "" && phone == "" {
		return RegistrationResult{ErrorCode: 4, ErrorMessage: "Vui lòng cung cấp Email, Tên đăng nhập hoặc Số điện thoại để đăng ký."}
	}
	if rawPassword == "" {
		return RegistrationResult{ErrorCode: 4, ErrorMessage: "Mật khẩu không được để trống."}
	}
	loginID := firstNonEmptyString(email, username, phone)
	if loginID == "" {
		return RegistrationResult{ErrorCode: 4, ErrorMessage: "Không thể xác định định danh đăng ký chính."}
	}
	for _, id := range uniqueNonEmpty(email, username, phone) {
		if s.findAccountUser("email", id) != nil || s.findAccountUser("username", id) != nil || s.findAccountUser("phoneNumber", id) != nil {
			return RegistrationResult{ErrorCode: 2, ErrorMessage: "Định danh '" + id + "' đã tồn tại."}
		}
		if len(s.rm.Find(CSMAppID, SubAccountsTable, model.EqFilter("login_identifier", id))) > 0 {
			return RegistrationResult{ErrorCode: 2, ErrorMessage: "Định danh '" + id + "' đã tồn tại trong danh sách người dùng con."}
		}
	}

	appID := ""
	if sourceToken, _ := req["app_token"].(string); sourceToken != "" {
		appID = extractAppIDFromToken(s.rm, sourceToken)
	}
	if appID == "" {
		appID, _ = req["app_id"].(string)
	}
	appID = strings.TrimSpace(appID)
	if appID == "" {
		return RegistrationResult{ErrorCode: 4, ErrorMessage: "Thiếu app_id hợp lệ để tạo app_token."}
	}

	appTokenRaw := appID + "_____" + loginID + "_____admin_____0"
	appToken := s.rm.CsmEncrypt(appTokenRaw)
	pass := s.rm.CsmEncrypt(loginID + "_____" + rawPassword)
	userData := map[string]any{
		"id": uuidNew(), "email": email, "username": username, "phoneNumber": phone,
		"pass": pass, "full_name": req["full_name"], "user_address": req["user_address"],
		"actived": true, "app_token": appToken, "refresh": appToken, "app_id": appID,
		"permissions": []any{"admin"}, "menusPermissions": []any{"home", "profile"},
		"source_app_token": req["app_token"],
	}
	for _, pk := range []string{"email", "username", "phoneNumber", "app_id", "app_token", "id"} {
		if userData[pk] == nil {
			userData[pk] = ""
		}
	}
	if _, err := s.rm.CreateRecord(CSMAppID, AccountsTable, userData, []string{"app_token"}); err != nil {
		return RegistrationResult{ErrorCode: 1, ErrorMessage: "Lỗi cơ sở dữ liệu trong quá trình đăng ký."}
	}
	_, _ = s.rm.CreateRecord(CSMAppID, AccountsTable, userData, []string{"id"})
	return RegistrationResult{Success: true, Message: "Đăng ký thành công!"}
}

func (s *UserService) CreateSubUser(req map[string]any, auth *security.AuthUser) RegistrationResult {
	if auth == nil {
		return RegistrationResult{ErrorMessage: "Not authenticated"}
	}
	loginID, _ := req["login_identifier"].(string)
	if loginID == "" {
		loginID, _ = req["username"].(string)
	}
	rawPassword, _ := req["password"].(string)
	if loginID == "" || rawPassword == "" {
		return RegistrationResult{ErrorCode: 4, ErrorMessage: "login_identifier và password là bắt buộc."}
	}
	if len(s.rm.Find(CSMAppID, SubAccountsTable, model.EqFilter("login_identifier", loginID))) > 0 {
		return RegistrationResult{ErrorCode: 2, ErrorMessage: "Login identifier đã tồn tại."}
	}
	parentID := auth.UserID
	if parentID == "" {
		parentID = auth.AppID
	}
	pass := s.rm.CsmEncrypt(loginID + "_____" + rawPassword)
	parentRecord := s.findParentAccount(parentID)
	appID := auth.AppID
	if appID == "" && len(parentRecord) > 0 {
		if v, ok := parentRecord["app_id"].(string); ok {
			appID = strings.TrimSpace(v)
		}
		if appID == "" {
			if pt, ok := parentRecord["app_token"].(string); ok && pt != "" {
				appID = util.ParseAppToken(s.rm, pt).AppID
			}
		}
	}
	if appID == "" {
		appID = CSMAppID
	}
	subTokenRaw := util.BuildRawToken(appID, loginID, "user", util.ResolveAccessRight("user"))
	subToken := s.rm.CsmEncrypt(subTokenRaw)
	parentToken := ""
	if len(parentRecord) > 0 {
		if pt, ok := parentRecord["app_token"].(string); ok {
			parentToken = pt
		}
	}
	subUser := map[string]any{
		"id": uuidNew(), "parent_account_id": parentID, "login_identifier": loginID,
		"pass": pass, "actived": true, "permissions": req["permissions"], "menusPermissions": req["menusPermissions"],
		"app_id": appID, "app_token": subToken, "source_app_token": parentToken,
		"email": loginID, "username": loginID,
		"refresh": subToken, "refresh_token": subToken,
		"login_version": 0, "loginVersion": 0,
	}
	if _, err := s.rm.CreateRecord(CSMAppID, SubAccountsTable, subUser, []string{"id"}); err != nil {
		return RegistrationResult{ErrorCode: 1, ErrorMessage: err.Error()}
	}
	id, _ := subUser["id"].(string)
	return RegistrationResult{Success: true, Message: "Tạo sub-user thành công", UserID: id}
}

func firstNonEmptyString(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func uniqueNonEmpty(values ...string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func uuidNew() string {
	return uuid.NewString()
}
