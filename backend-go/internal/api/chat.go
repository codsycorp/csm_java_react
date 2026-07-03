package api

import (
	"sort"
	"strings"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/state"
)

func dispatchChatAPI(st *state.AppState, path string, params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	switch path {
	case "/chat-history":
		return handleChatHistory(st, params)
	case "/chat-history-guest":
		return handleChatHistoryGuest(st, params)
	case "/chat-history-app":
		return handleChatHistoryApp(st, params)
	case "/chat-guests-list":
		return handleChatGuestsList(st, params)
	case "/chat-mark-read", "/chat-mark-read-guest":
		return handleChatMarkRead(st, params)
	case "/chat-mark-all-read", "/chat-mark-read-all":
		return handleChatMarkAllRead(st, params, auth)
	case "/chat-delete-message":
		return handleChatDeleteMessage(st, params, auth)
	default:
		return model.ErrorResponse(404, "Unknown chat path: "+path)
	}
}

func handleChatHistory(st *state.AppState, params map[string]any) *model.StandardResponse {
	room := firstTrimmed(params, "room")
	if room == "" {
		return model.ErrorResponse(400, "Missing 'room' parameter")
	}
	appID := resolveAppIDParam(params)
	if appID == "" {
		appID = inferAppIDFromRoom(room)
	}
	limit := intParam(params, 50, "limit")
	history := normalizeChatMessages(st.ChatService.GetHistoryByRoom(appID, room, limit), appID)
	data := map[string]any{
		"room":     room,
		"appId":    appID,
		"messages": history,
		"count":    len(history),
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", data)
	r.Set("message", "Retrieved "+itoa(len(history))+" messages")
	return r
}

func handleChatHistoryGuest(st *state.AppState, params map[string]any) *model.StandardResponse {
	appID := resolveAppIDParam(params)
	guestPhone := firstTrimmed(params, "guestPhone", "guest_phone")
	guestSessionID := firstTrimmed(params, "guestSessionId", "guest_session_id", "guest_identity")
	limit := intParam(params, 50, "limit")

	if appID == "" || (guestPhone == "" && guestSessionID == "") {
		return model.ErrorResponse(400, "Missing 'appId' and guest identity parameter")
	}

	history := normalizeChatMessages(st.ChatService.GetHistoryByGuestIdentity(appID, guestSessionID, guestPhone, limit), appID)
	data := map[string]any{
		"appId":          appID,
		"guestPhone":     guestPhone,
		"guestSessionId": guestSessionID,
		"messages":       history,
		"count":          len(history),
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", data)
	r.Set("message", "Retrieved "+itoa(len(history))+" messages")
	return r
}

func handleChatHistoryApp(st *state.AppState, params map[string]any) *model.StandardResponse {
	appID := resolveAppIDParam(params)
	if appID == "" {
		return model.ErrorResponse(400, "Missing 'appId' parameter")
	}
	limit := intParam(params, 200, "limit")
	history := normalizeChatMessages(st.ChatService.GetHistoryByAppID(appID, limit), appID)
	data := map[string]any{
		"appId":    appID,
		"messages": history,
		"count":    len(history),
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", data)
	r.Set("message", "Retrieved "+itoa(len(history))+" messages")
	return r
}

func handleChatGuestsList(st *state.AppState, params map[string]any) *model.StandardResponse {
	appID := resolveAppIDParam(params)
	if appID == "" {
		return model.ErrorResponse(400, "Missing 'appId' parameter")
	}
	guestSessions := st.ChatService.GetGuestSessionsByAppID(appID)
	guestPhones := st.ChatService.GetGuestPhonesByAppID(appID)
	data := map[string]any{
		"appId":         appID,
		"guests":        guestSessions,
		"guestSessions": guestSessions,
		"guestPhones":   guestPhones,
		"count":         len(guestSessions),
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", data)
	r.Set("message", "Retrieved "+itoa(len(guestSessions))+" guest users")
	return r
}

func handleChatMarkRead(st *state.AppState, params map[string]any) *model.StandardResponse {
	appID := resolveAppIDParam(params)
	guestPhone := firstTrimmed(params, "guestPhone", "guest_phone")
	guestSessionID := firstTrimmed(params, "guestSessionId", "guest_session_id", "guest_identity")
	if appID == "" || (guestPhone == "" && guestSessionID == "") {
		return model.ErrorResponse(400, "Missing 'appId' and guest identity parameter")
	}
	updated := st.ChatService.MarkAllAsReadByGuestIdentity(appID, guestSessionID, guestPhone)
	data := map[string]any{
		"appId":          appID,
		"guestPhone":     guestPhone,
		"guestSessionId": guestSessionID,
		"updated":        updated,
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", data)
	r.Set("message", "Marked all messages as read")
	return r
}

func handleChatMarkAllRead(st *state.AppState, params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	room := firstTrimmed(params, "room")
	userID := firstTrimmed(params, "userId", "user_id")
	if room == "" || userID == "" {
		return model.ErrorResponse(400, "Missing 'room' or 'userId' parameter")
	}
	updated := st.ChatService.MarkAllAsRead(room, userID)
	data := map[string]any{
		"room":    room,
		"userId":  userID,
		"updated": updated,
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", data)
	r.Set("message", "Marked all messages as read")
	return r
}

func handleChatDeleteMessage(st *state.AppState, params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	timestamp := int64Param(params, 0, "timestamp")
	if timestamp <= 0 {
		return model.ErrorResponse(400, "Missing or invalid 'timestamp' parameter")
	}
	appID := resolveAppIDParam(params)
	if appID == "" {
		appID = "csm"
	}
	deleted := st.ChatService.DeleteMessage(appID, timestamp)
	if !deleted {
		return model.ErrorResponse(404, "Message not found")
	}
	data := map[string]any{
		"timestamp": timestamp,
		"appId":     appID,
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", data)
	r.Set("message", "Message deleted successfully")
	return r
}

func resolveAppIDParam(params map[string]any) string {
	appID := firstTrimmed(params, "appId", "app_id")
	if appID == "" || isPhoneLikeValue(appID) {
		return ""
	}
	return appID
}

func inferAppIDFromRoom(room string) string {
	normalized := strings.TrimSpace(room)
	if normalized == "" {
		return "csm"
	}
	if idx := strings.Index(normalized, ":"); idx >= 0 && idx < len(normalized)-1 {
		normalized = normalized[idx+1:]
	}
	if idx := strings.Index(normalized, ";"); idx > 0 {
		normalized = normalized[:idx]
	}
	if normalized == "" || isPhoneLikeValue(normalized) {
		return "csm"
	}
	return normalized
}

func isPhoneLikeValue(value string) bool {
	v := strings.TrimSpace(value)
	if len(v) < 8 {
		return false
	}
	if v[0] == '+' {
		v = v[1:]
	}
	if len(v) < 8 {
		return false
	}
	for _, ch := range v {
		if (ch < '0' || ch > '9') && ch != ' ' && ch != '-' {
			return false
		}
	}
	return true
}

func firstTrimmed(params map[string]any, keys ...string) string {
	for _, k := range keys {
		switch v := params[k].(type) {
		case string:
			s := strings.TrimSpace(v)
			if s != "" {
				return s
			}
		}
	}
	return ""
}

func intParam(params map[string]any, def int, keys ...string) int {
	for _, k := range keys {
		switch v := params[k].(type) {
		case int:
			if v > 0 {
				return v
			}
		case int64:
			if v > 0 {
				return int(v)
			}
		case float64:
			if v > 0 {
				return int(v)
			}
		case string:
			if iv, ok := atoiPositive(v); ok {
				return iv
			}
		}
	}
	return def
}

func int64Param(params map[string]any, def int64, keys ...string) int64 {
	for _, k := range keys {
		switch v := params[k].(type) {
		case int:
			if v > 0 {
				return int64(v)
			}
		case int64:
			if v > 0 {
				return v
			}
		case float64:
			if v > 0 {
				return int64(v)
			}
		case string:
			if iv, ok := atoiPositive(v); ok {
				return int64(iv)
			}
		}
	}
	return def
}

func atoiPositive(s string) (int, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	n := 0
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return 0, false
		}
		n = n*10 + int(ch-'0')
	}
	if n <= 0 {
		return 0, false
	}
	return n, true
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	buf := make([]byte, 0, 16)
	for v > 0 {
		buf = append(buf, byte('0'+v%10))
		v /= 10
	}
	if neg {
		buf = append(buf, '-')
	}
	for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
		buf[i], buf[j] = buf[j], buf[i]
	}
	return string(buf)
}

func normalizeChatMessages(messages []map[string]any, appID string) []map[string]any {
	if len(messages) == 0 {
		return messages
	}
	normalized := make([]map[string]any, 0, len(messages))
	for _, msg := range messages {
		clone := make(map[string]any, len(msg))
		for k, v := range msg {
			clone[k] = v
		}
		if room, ok := clone["room"].(string); ok && room == "csm" {
			clone["room"] = appID
		}
		normalized = append(normalized, clone)
	}
	sort.SliceStable(normalized, func(i, j int) bool {
		return msgTimestamp(normalized[i]) < msgTimestamp(normalized[j])
	})
	return normalized
}

func msgTimestamp(msg map[string]any) int64 {
	switch v := msg["timestamp"].(type) {
	case float64:
		return int64(v)
	case int64:
		return v
	case int:
		return int64(v)
	case string:
		return int64Param(map[string]any{"v": v}, 0, "v")
	default:
		return 0
	}
}
