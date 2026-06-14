package model

import (
	"encoding/json"
	"strings"
)

type User struct {
	ID                    *string          `json:"id,omitempty"`
	RefreshToken          *string          `json:"refreshToken,omitempty"`
	RefreshTokenIP        *string          `json:"refreshTokenIp,omitempty"`
	RefreshTokenUA        *string          `json:"refreshTokenUa,omitempty"`
	RefreshTokenClientID  *string          `json:"refreshTokenClientId,omitempty"`
	RefreshTokenExpiry    *int64           `json:"refreshTokenExpiry,omitempty"`
	Email                 *string          `json:"email,omitempty"`
	Password              *string          `json:"pass,omitempty"`
	Username              *string          `json:"username,omitempty"`
	PhoneNumber           *string          `json:"phoneNumber,omitempty"`
	Actived               *bool            `json:"actived,omitempty"`
	AppToken              *string          `json:"app_token,omitempty"`
	AppID                 *string          `json:"app_id,omitempty"`
	DataAppIDs            []string         `json:"data_app_ids,omitempty"`
	FullName              *string          `json:"full_name,omitempty"`
	UserAddress           json.RawMessage  `json:"user_address,omitempty"`
	Avatar                *string          `json:"avatar,omitempty"`
	Permissions           []string         `json:"permissions,omitempty"`
	MenusPermissions      []string         `json:"menusPermissions,omitempty"`
	PermissionBitfield    *string          `json:"permissionBitfield,omitempty"`
	PermissionSchemaVer   *string          `json:"permissionSchemaVersion,omitempty"`
	DataScope             *string          `json:"dataScope,omitempty"`
	DeptID                *string          `json:"deptId,omitempty"`
	BranchID              *string          `json:"branchId,omitempty"`
	Dev                   *bool            `json:"dev,omitempty"`
	IsSubUser             *bool            `json:"isSubUser,omitempty"`
	LoginVersion          *int             `json:"loginVersion,omitempty"`
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
		} else {
			t := true
			user.Actived = &t
		}
	}
	if user.LoginVersion == nil {
		if v, ok := intFromAny(record["login_version"]); ok {
			user.LoginVersion = &v
		} else if v, ok := intFromAny(record["loginVersion"]); ok {
			user.LoginVersion = &v
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

func Int64Ptr(i int64) *int64 { return &i }

func UserStr(u User, getter func(User) *string) string {
	if v := getter(u); v != nil {
		return *v
	}
	return ""
}
