package util

import (
	"strings"

	"csm_server/backend-go/internal/data"
)

type AppTokenMeta struct {
	AppID            string
	LoginIdentifier  string
	Role             string
	AccessRight      int
}

func ParseAppToken(rm *data.RecordManager, token string) AppTokenMeta {
	token = strings.TrimSpace(token)
	if token == "" {
		return AppTokenMeta{}
	}
	decrypted, err := rm.CsmDecrypt(token)
	if err != nil {
		decrypted = token
	}
	return ParseDecryptedToken(decrypted)
}

func ParseDecryptedToken(decrypted string) AppTokenMeta {
	parts := strings.Split(decrypted, "_____")
	meta := AppTokenMeta{}
	if len(parts) > 0 {
		meta.AppID = strings.TrimSpace(parts[0])
	}
	if len(parts) > 1 {
		meta.LoginIdentifier = strings.TrimSpace(parts[1])
	}
	if len(parts) > 2 {
		meta.Role = strings.TrimSpace(parts[2])
	}
	if len(parts) > 0 {
		if v, ok := parseInt(parts[len(parts)-1]); ok {
			meta.AccessRight = v
		}
	}
	return meta
}

func IsSubUserRole(role string) bool {
	return strings.EqualFold(strings.TrimSpace(role), "user")
}

func AppIDFromToken(rm *data.RecordManager, token string) string {
	meta := ParseAppToken(rm, token)
	return meta.AppID
}

func parseInt(s string) (int, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	var n int
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, false
		}
		n = n*10 + int(c-'0')
	}
	return n, true
}
