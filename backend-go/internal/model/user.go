package model

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

type User struct {
	ID                   *string          `json:"id,omitempty"`
	RefreshToken         *string          `json:"refreshToken,omitempty"`
	RefreshTokenIP       *string          `json:"refreshTokenIp,omitempty"`
	RefreshTokenUA       *string          `json:"refreshTokenUa,omitempty"`
	RefreshTokenClientID *string          `json:"refreshTokenClientId,omitempty"`
	RefreshTokenExpiry   *int64           `json:"refreshTokenExpiry,omitempty"`
	AccountExpiryAt      *int64           `json:"accountExpiryAt,omitempty"`
	Email                *string          `json:"email,omitempty"`
	Password             *string          `json:"pass,omitempty"`
	Username             *string          `json:"username,omitempty"`
	PhoneNumber          *string          `json:"phoneNumber,omitempty"`
	Actived              *bool            `json:"actived,omitempty"`
	AppToken             *string          `json:"app_token,omitempty"`
	AppID                *string          `json:"app_id,omitempty"`
	DataAppIDs           []string         `json:"data_app_ids,omitempty"`
	FullName             *string          `json:"full_name,omitempty"`
	UserAddress          json.RawMessage  `json:"user_address,omitempty"`
	Avatar               *string          `json:"avatar,omitempty"`
	Permissions          []string         `json:"permissions,omitempty"`
	MenusPermissions     []string         `json:"menusPermissions,omitempty"`
	PermissionBitfield   *string          `json:"permissionBitfield,omitempty"`
	PermissionSchemaVer  *string          `json:"permissionSchemaVersion,omitempty"`
	DataScope            *string          `json:"dataScope,omitempty"`
	DeptID               *string          `json:"deptId,omitempty"`
	BranchID             *string          `json:"branchId,omitempty"`
	Dev                  *bool            `json:"dev,omitempty"`
	IsSubUser            *bool            `json:"isSubUser,omitempty"`
	LoginVersion         *int             `json:"loginVersion,omitempty"`
	GroupRights          []map[string]any `json:"group_rights,omitempty"`
}

func UserFromRecord(record map[string]any) User {
	raw, _ := json.Marshal(record)
	var user User
	_ = json.Unmarshal(raw, &user)
	if user.Password == nil {
		if v, ok := record["pass"].(string); ok {
			user.Password = &v
		} else if v, ok := record["password"].(string); ok {
			user.Password = &v
		}
	}
	if user.RefreshToken == nil {
		if v, ok := record["refresh_token"].(string); ok {
			user.RefreshToken = &v
		} else if v, ok := record["refresh"].(string); ok {
			user.RefreshToken = &v
		}
	}
	if user.PhoneNumber == nil {
		if v, ok := record["phoneNumber"].(string); ok {
			user.PhoneNumber = &v
		}
	}
	if user.Permissions == nil {
		user.Permissions = stringListFromValue(record["permissions"])
	}
	if user.MenusPermissions == nil {
		if v, ok := record["menusPermissions"]; ok {
			user.MenusPermissions = stringListFromValue(v)
		} else if v, ok := record["menus_permissions"]; ok {
			user.MenusPermissions = stringListFromValue(v)
		}
	}
	if user.Actived == nil {
		if v, ok := record["actived"].(bool); ok {
			user.Actived = &v
		}
	}
	if len(user.GroupRights) == 0 {
		user.GroupRights = MapListFromRecord(record, "group_rights", "groupRights")
	}
	if user.LoginVersion == nil {
		if v, ok := intFromAny(record["login_version"]); ok {
			user.LoginVersion = &v
		} else if v, ok := intFromAny(record["loginVersion"]); ok {
			user.LoginVersion = &v
		}
	}
	if user.AccountExpiryAt == nil {
		if v := accountExpiryFromRecord(record); v > 0 {
			user.AccountExpiryAt = &v
		}
	}
	if len(user.DataAppIDs) == 0 {
		user.DataAppIDs = StringListFromRecord(record, "data_app_ids", "dataAppIds")
	}
	return user
}

func stringListFromValue(v any) []string {
	switch t := v.(type) {
	case []string:
		return trimNonEmptyStrings(t)
	case []any:
		out := make([]string, 0, len(t))
		for _, item := range t {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
		return out
	case string:
		text := strings.TrimSpace(t)
		if text == "" {
			return nil
		}
		if strings.HasPrefix(text, "[") {
			var parsed []string
			if err := json.Unmarshal([]byte(text), &parsed); err == nil {
				return trimNonEmptyStrings(parsed)
			}
			var parsedAny []any
			if err := json.Unmarshal([]byte(text), &parsedAny); err == nil {
				return stringListFromValue(parsedAny)
			}
		}
		if strings.Contains(text, ",") || strings.Contains(text, ";") || strings.Contains(text, "\n") {
			parts := strings.FieldsFunc(text, func(r rune) bool {
				return r == ',' || r == ';' || r == '\n'
			})
			return trimNonEmptyStrings(parts)
		}
		return []string{text}
	default:
		return nil
	}
}

func trimNonEmptyStrings(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

func IntFromAny(v any) (int, bool) {
	return intFromAny(v)
}

func StringListFromRecord(record map[string]any, keys ...string) []string {
	for _, key := range keys {
		if v, ok := record[key]; ok {
			if list := stringListFromValue(v); len(list) > 0 {
				return list
			}
		}
	}
	return nil
}

func intFromAny(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	case json.Number:
		i, err := n.Int64()
		return int(i), err == nil
	default:
		return 0, false
	}
}

func StrPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func BoolPtr(b bool) *bool { return &b }

func IntPtr(i int) *int { return &i }

// MapListFromRecord parses group_rights-style []map values from a DB record.
func MapListFromRecord(record map[string]any, keys ...string) []map[string]any {
	if record == nil {
		return nil
	}
	for _, key := range keys {
		v, ok := record[key]
		if !ok || v == nil {
			continue
		}
		switch items := v.(type) {
		case []map[string]any:
			if len(items) > 0 {
				return items
			}
		case []any:
			out := make([]map[string]any, 0, len(items))
			for _, item := range items {
				if m, ok := item.(map[string]any); ok && len(m) > 0 {
					out = append(out, m)
				}
			}
			if len(out) > 0 {
				return out
			}
		case string:
			text := strings.TrimSpace(items)
			if text == "" || text[0] != '[' {
				continue
			}
			var parsed []map[string]any
			if err := json.Unmarshal([]byte(text), &parsed); err == nil && len(parsed) > 0 {
				return parsed
			}
		}
	}
	return nil
}

func Int64Ptr(i int64) *int64 { return &i }

func AccountExpiryFromRecord(record map[string]any) int64 {
	return accountExpiryFromRecord(record)
}

func AccountExpiryFromAny(v any) int64 {
	return parseAccountExpiryValue(v)
}

func accountExpiryFromRecord(record map[string]any) int64 {
	for _, key := range []string{"account_expiry_at", "accountExpiryAt", "valid_until", "validUntil", "expiry_at", "expiryAt", "expires_at", "expiresAt", "end_date", "endDate", "subscription_end", "subscriptionEnd"} {
		if v, ok := record[key]; ok {
			if ms := parseAccountExpiryValue(v); ms > 0 {
				return ms
			}
		}
	}
	return 0
}

func parseAccountExpiryValue(v any) int64 {
	if v == nil {
		return 0
	}
	switch t := v.(type) {
	case int64:
		return normalizeAccountExpiryEpoch(t)
	case int:
		return normalizeAccountExpiryEpoch(int64(t))
	case float64:
		return normalizeAccountExpiryEpoch(int64(t))
	case json.Number:
		if n, err := t.Int64(); err == nil {
			return normalizeAccountExpiryEpoch(n)
		}
	case string:
		return parseAccountExpiryString(t)
	}
	return 0
}

func normalizeAccountExpiryEpoch(raw int64) int64 {
	if raw <= 0 {
		return 0
	}
	if raw < 1_000_000_000_000 {
		return raw * 1000
	}
	return raw
}

func parseAccountExpiryString(raw string) int64 {
	text := strings.TrimSpace(raw)
	if text == "" {
		return 0
	}
	if len(text) >= 10 && len(text) <= 13 {
		if n, err := strconv.ParseInt(text, 10, 64); err == nil {
			return normalizeAccountExpiryEpoch(n)
		}
	}
	if len(text) == 8 && isAllDigits(text) {
		if d, err := time.ParseInLocation("20060102", text, time.Local); err == nil {
			return d.Add(24*time.Hour - time.Millisecond).UnixMilli()
		}
	}
	if len(text) == 10 && text[4] == '-' && text[7] == '-' {
		if d, err := time.ParseInLocation("2006-01-02", text, time.Local); err == nil {
			return d.Add(24*time.Hour - time.Millisecond).UnixMilli()
		}
	}
	if len(text) == 10 && text[4] == '/' && text[7] == '/' {
		if d, err := time.ParseInLocation("2006/01/02", text, time.Local); err == nil {
			return d.Add(24*time.Hour - time.Millisecond).UnixMilli()
		}
	}
	if parsed, ok := parseDateTimeLikeString(text); ok {
		return parsed
	}
	return 0
}

func parseDateTimeLikeString(text string) (int64, bool) {
	for _, layout := range []string{time.RFC3339, time.RFC3339Nano, "2006-01-02 15:04:05", "2006-01-02 15:04", "2006/01/02 15:04:05", "2006/01/02 15:04"} {
		if d, err := time.ParseInLocation(layout, text, time.Local); err == nil {
			return d.UnixMilli(), true
		}
	}
	if len(text) == 14 && isAllDigits(text) {
		if d, err := time.ParseInLocation("20060102150405", text, time.Local); err == nil {
			return d.UnixMilli(), true
		}
	}
	return 0, false
}

func isAllDigits(text string) bool {
	for _, r := range text {
		if r < '0' || r > '9' {
			return false
		}
	}
	return text != ""
}

func UserStr(u User, getter func(User) *string) string {
	if v := getter(u); v != nil {
		return *v
	}
	return ""
}
