package api

import (
	"context"
	"net/http"
	"strings"

	"csm_server/backend-go/internal/api/paths"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/state"
)

func AuthMiddleware(st *state.AppState) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			uri := r.URL.Path
			host := extractHost(r.Header)
			clean := strings.TrimPrefix(uri, "/api")

			// Mirror CatchAll: bare API paths on non-admin hosts (localhost:9999, vite proxy rewrite)
			// must still pass through JWT/refresh auth — user-info self-validates in handler but
			// get-async-routes and most endpoints rely on AuthUser in context.
			if !isDispatchAPIRequest(uri, host) || isPublicAPIPath(r.Method, clean) {
				next.ServeHTTP(w, r)
				return
			}

			clientIP := security.ClientIPFromRequest(r)
			clientUA := security.UserAgentFromHeaders(r.Header)
			clientID := security.ClientIDFromHeaders(r.Header)

			if isOptionalAuthAPIPath(clean) {
				if auth := resolveAuthUser(st, r, clientIP, clientUA, clientID); auth != nil {
					ctx := context.WithValue(r.Context(), security.AuthUserKey, *auth)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
				next.ServeHTTP(w, r)
				return
			}

			if auth := resolveAuthUser(st, r, clientIP, clientUA, clientID); auth != nil {
				ctx := context.WithValue(r.Context(), security.AuthUserKey, *auth)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"code":401,"success":false,"message":"Invalid or expired JWT token"}`))
		})
	}
}

func resolveAuthUser(st *state.AppState, r *http.Request, clientIP, clientUA, clientID string) *security.AuthUser {
	token := sessionTokenFromRequest(r)
	jwtHints := jwtHintsFromToken(st, token)
	csmValid := token != "" && st.JWT.ValidateToken(token)

	// Bearer: invalid token hard-fails (mirror Java).
	if bearer := bearerToken(r); bearer != "" {
		if !st.JWT.ValidateToken(bearer) {
			return nil
		}
		if user := st.UserService.ResolveFromJWT(st.JWT, bearer); user != nil {
			if claims, err := st.JWT.ParseClaims(bearer); err == nil && security.UserMatchesJWTHints(*user, claims.UID, claims.Sub) {
				au := security.AuthUserFromUser(*user, false)
				au.SessionFresh = true
				return &au
			}
		}
		return nil
	}

	if token != "" {
		user := st.UserService.ResolveFromJWT(st.JWT, token)
		if user == nil {
			// Expired JWT with valid signature/login_version: avoid refresh-token storms on parallel requests.
			user = st.UserService.ResolveFromJWTAllowExpired(st.JWT, token)
		}
		if user != nil {
			claims, err := st.JWT.ParseClaims(token)
			if err != nil {
				claims, err = st.JWT.ParseClaimsAllowExpired(token)
			}
			if err == nil && security.UserMatchesJWTHints(*user, claims.UID, claims.Sub) {
				au := security.AuthUserFromUser(*user, false)
				au.SessionFresh = true
				return &au
			}
		}
		// Valid JWT but stale resolve — fall through to refresh-token path (Java behavior).
	}

	for _, rt := range refreshTokenCandidates(r) {
		user := st.UserService.FindUserByRefreshToken(rt, true)
		if user == nil {
			continue
		}
		if !security.RefreshSessionValidForMiddleware(*user, clientIP, clientUA, clientID) {
			continue
		}
		if csmValid && !refreshAllowedForJWTHints(*user, jwtHints) {
			continue
		}
		au := security.AuthUserFromUser(*user, false)
		return &au
	}
	return nil
}

type jwtHintClaims struct {
	uid string
	sub string
}

func jwtHintsFromToken(st *state.AppState, token string) *jwtHintClaims {
	if token == "" {
		return nil
	}
	claims, err := st.JWT.ParseClaims(token)
	if err != nil {
		claims, err = st.JWT.ParseClaimsAllowExpired(token)
	}
	if err != nil {
		return nil
	}
	return &jwtHintClaims{uid: claims.UID, sub: claims.Sub}
}

func refreshAllowedForJWTHints(user model.User, hints *jwtHintClaims) bool {
	if hints == nil {
		return true
	}
	return security.UserMatchesJWTHints(user, hints.uid, hints.sub)
}

func sessionTokenFromRequest(r *http.Request) string {
	if bearer := bearerToken(r); bearer != "" {
		return bearer
	}
	token := strings.TrimSpace(r.Header.Get("csm-token"))
	if token == "" {
		token = strings.TrimSpace(r.Header.Get("Authorization"))
		token = strings.TrimPrefix(token, "Bearer ")
	}
	return token
}

func bearerToken(r *http.Request) string {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return ""
}

func isPublicAPIPath(method, path string) bool {
	if method == http.MethodOptions {
		return true
	}
	switch path {
	case "/login", "/refresh-token", "/register", "/create-default-data",
		"/chat-history", "/chat-history-guest", "/chat-history-app",
		"/chat-mark-read", "/chat-mark-read-guest", "/chat-mark-all-read", "/chat-mark-read-all":
		return true
	}
	if strings.HasPrefix(path, "/monitoring") || strings.HasPrefix(path, "/ai-local") {
		return true
	}
	if path == "/crm/customer" && (method == http.MethodPost || method == http.MethodPut) {
		return true
	}
	return false
}

// Optional-auth endpoints: used by dynamic-code fetch() which may not send sessionStorage tokens.
// Handler does not require AuthUser; attach auth when credentials are present.
func isOptionalAuthAPIPath(path string) bool {
	switch path {
	case "/scrape-web", "/execute-js-on-page":
		return true
	}
	return false
}

func refreshTokenCandidates(r *http.Request) []string {
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
	// Prefer HttpOnly cookie over X-Refresh-Token header: after rotation the cookie is updated first
	// while parallel requests may still carry a stale header from sessionStorage.
	if c, err := r.Cookie("refreshToken"); err == nil {
		add(c.Value)
	}
	add(r.Header.Get("X-Refresh-Token"))
	return out
}

// isDispatchAPIRequest mirrors CatchAll routing: api.* host, /api/* prefix, direct AI paths,
// and bare auth/table paths on non-admin hosts (localhost dev + vite proxy after /api rewrite).
func isDispatchAPIRequest(uri, host string) bool {
	isAdminHost := strings.HasPrefix(host, "admin.")
	return security.IsAPIRequest(uri, host) ||
		paths.IsDirectAIPath(uri) ||
		(!isAdminHost && paths.IsBareAPIPath(uri))
}
