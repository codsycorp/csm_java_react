package security

import (
	"net"
	"net/http"
	"strings"
	"time"

	"csm_server/backend-go/internal/model"
)

func NormalizeClientIP(ip string) string {
	ip = strings.TrimSpace(ip)
	switch ip {
	case "::1", "0:0:0:0:0:0:0:1":
		return "127.0.0.1"
	default:
		return ip
	}
}

func NormalizeUserAgent(ua string) string {
	return strings.TrimSpace(ua)
}

func UserAgentMatches(currentUA, savedUA string) bool {
	current := NormalizeUserAgent(currentUA)
	saved := NormalizeUserAgent(savedUA)
	if current == "" || saved == "" {
		return false
	}
	return current == saved
}

func RefreshTokenIPMatches(user model.User, clientIP string) bool {
	saved := ""
	if user.RefreshTokenIP != nil {
		saved = NormalizeClientIP(*user.RefreshTokenIP)
	}
	return NormalizeClientIP(clientIP) == saved
}

func RefreshTokenUAMatches(user model.User, clientUA string) bool {
	saved := ""
	if user.RefreshTokenUA != nil {
		saved = *user.RefreshTokenUA
	}
	return UserAgentMatches(clientUA, saved)
}

func ClientIPFromHeaders(h http.Header) string {
	if xff := h.Get("X-Forwarded-For"); xff != "" {
		if part := strings.TrimSpace(strings.Split(xff, ",")[0]); part != "" {
			return NormalizeClientIP(part)
		}
	}
	if ip := strings.TrimSpace(h.Get("X-Real-Ip")); ip != "" {
		return NormalizeClientIP(ip)
	}
	return ""
}

func ClientIPFromRequest(r *http.Request) string {
	if ip := ClientIPFromHeaders(r.Header); ip != "" {
		return ip
	}
	if r != nil && r.RemoteAddr != "" {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		return NormalizeClientIP(host)
	}
	return ""
}

func UserAgentFromHeaders(h http.Header) string {
	return NormalizeUserAgent(h.Get("User-Agent"))
}

func ClientIDFromHeaders(h http.Header) string {
	return strings.TrimSpace(h.Get("X-Client-Id"))
}

func RefreshTokenExpired(user model.User) bool {
	expiry := int64(0)
	if user.RefreshTokenExpiry != nil {
		expiry = *user.RefreshTokenExpiry
	}
	// Java parity: 0 means unset — not expired until a positive expiry is in the past.
	if expiry <= 0 {
		return false
	}
	return expiry <= time.Now().UnixMilli()
}

func RefreshTokenClientMatches(user model.User, clientID string) bool {
	saved := ""
	if user.RefreshTokenClientID != nil {
		saved = strings.TrimSpace(*user.RefreshTokenClientID)
	}
	if saved == "" {
		return true
	}
	clientID = strings.TrimSpace(clientID)
	return clientID != "" && saved == clientID
}

func RefreshSessionMatches(user model.User, clientIP, clientUA, clientID string) bool {
	return RefreshTokenIPMatches(user, clientIP) &&
		RefreshTokenUAMatches(user, clientUA) &&
		RefreshTokenClientMatches(user, clientID)
}

func RefreshSessionValid(user model.User, clientIP, clientUA, clientID string) bool {
	if RefreshTokenExpired(user) {
		return false
	}
	return RefreshSessionMatches(user, clientIP, clientUA, clientID)
}

func RefreshSessionValidForMiddleware(user model.User, clientIP, clientUA, clientID string) bool {
	if RefreshTokenExpired(user) {
		return false
	}
	savedIP := ""
	if user.RefreshTokenIP != nil {
		savedIP = NormalizeClientIP(*user.RefreshTokenIP)
	}
	savedUA := ""
	if user.RefreshTokenUA != nil {
		savedUA = NormalizeUserAgent(*user.RefreshTokenUA)
	}
	// Mirror Java JwtAuthenticationFilter: require stored IP/UA when present.
	if savedIP != "" && NormalizeClientIP(clientIP) != savedIP {
		return false
	}
	if savedUA != "" && !UserAgentMatches(clientUA, savedUA) {
		return false
	}
	// Java refresh fallback does not require X-Client-Id; only validate when caller sends it.
	if strings.TrimSpace(clientID) != "" {
		return RefreshTokenClientMatches(user, clientID)
	}
	return true
}

func RefreshSessionValidForEndpoint(user model.User, clientIP, clientUA string) bool {
	if RefreshTokenExpired(user) {
		return false
	}
	return RefreshTokenIPMatches(user, clientIP) && RefreshTokenUAMatches(user, clientUA)
}

func RefreshTokenCandidates(h http.Header, params map[string]any) []string {
	var out []string
	seen := make(map[string]struct{})
	add := func(t string) {
		t = strings.TrimSpace(t)
		if t == "" {
			return
		}
		if _, ok := seen[t]; ok {
			return
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	add(h.Get("X-Refresh-Token"))
	if v, ok := params["refreshTokenHeader"].(string); ok {
		add(v)
	}
	if v, ok := params["refreshToken"].(string); ok {
		add(v)
	}
	return out
}
