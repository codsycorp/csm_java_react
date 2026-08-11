package socket

import (
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	socketio "github.com/zishang520/socket.io/v2/socket"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/services"
)

type sessionState struct {
	appID         string
	username      string
	guestPhone    string
	guestIdentity string
	locale        string
	isAdmin       bool
}

var (
	sessionMu sync.RWMutex
	sessions  = map[string]*sessionState{}
)

func registerSocketEvents(s *socketio.Socket, io *socketio.Server, deps Dependencies) {
	s.On("join_room", func(args ...any) {
		room := stringArg(args, 0)
		if room == "" {
			return
		}
		s.Join(socketio.Room(room))
		_ = s.Emit("user_joined", map[string]any{"room": room})
	})

	s.On("join", func(args ...any) {
		data := mapArg(args, 0)
		handleJoin(s, data)
	})

	s.On("chat", func(args ...any) {
		data := mapArg(args, 0)
		handleChat(s, deps, data)
	})

	s.On("csm_msg_update", func(args ...any) {
		if len(args) > 0 {
			s.Broadcast().Emit("csm_msg_update", args[0])
		}
	})

	s.On("chat_history", func(args ...any) {
		room := stringArg(args, 0)
		history := deps.Chat.GetHistory("default", room)
		_ = s.Emit("chat_history", history)
	})

	s.On("chat_history_guest", func(args ...any) {
		data := mapArg(args, 0)
		appID := firstStr(data, "appId", "app_id", "default")
		sid := firstStr(data, "guestSessionId", "guest_session_id")
		phone := firstStr(data, "guestPhone", "guest_phone")
		if sid == "" && phone == "" {
			_ = s.Emit("chat_history_guest", []any{})
			return
		}
		history := deps.Chat.GetHistoryByGuestIdentity(appID, sid, phone, 50)
		_ = s.Emit("chat_history_guest", history)
	})

	s.On("chat_history_app", func(args ...any) {
		appID := stringArg(args, 0)
		if appID == "" {
			appID = "default"
		}
		history := deps.Chat.GetHistory(appID, "app")
		_ = s.Emit("chat_history_app_snapshot", history)
	})

	s.On("request_chat_history_app_snapshot", func(args ...any) {
		appID := stringArg(args, 0)
		if appID == "" {
			appID = "default"
		}
		history := deps.Chat.GetHistory(appID, "app")
		_ = s.Emit("chat_history_app_snapshot", history)
	})

	s.On("chat_mark_read", func(args ...any) {
		_ = s.Emit("chat_mark_read", map[string]any{"ok": true})
	})

	s.On("chat_mark_all_read", func(_ ...any) {
		_ = s.Emit("chat_mark_all_read", map[string]any{"ok": true})
	})

	s.On("chat_recall_message", func(args ...any) {
		if len(args) > 0 {
			io.Emit("chat_message_recalled", args[0])
		}
	})

	s.On("user_typing", func(args ...any) {
		if len(args) > 0 {
			s.Broadcast().Emit("user_typing", args[0])
		}
	})

	s.On("broadcast_notification", func(args ...any) {
		if len(args) > 0 {
			io.Emit("notification", args[0])
		}
	})

	s.On("register_guest_phone", func(args ...any) {
		data := mapArg(args, 0)
		handleRegisterGuestPhone(s, deps, data)
	})

	s.On("chat_guests_list", func(args ...any) {
		appID := stringArg(args, 0)
		_ = s.Emit("chat_guests_list", deps.Chat.GetGuestSessionsByAppID(appID))
	})

	s.On("chat_list_users", func(args ...any) {
		appID := stringArg(args, 0)
		page := deps.RM.Filter(appID, "csm_accounts", model.SearchFilter{Operator: "AND"})
		_ = s.Emit("chat_list_users", page["data"])
	})

	s.On("csm_sign_in", func(_ ...any) {
		_ = s.Emit("csm_sign_in", map[string]any{"ok": true, "message": "sign-in via socket"})
	})

	s.On("csm_register_an_account", func(_ ...any) {
		_ = s.Emit("csm_register_an_account", map[string]any{"ok": true})
	})
}

func handleJoin(s *socketio.Socket, data map[string]any) {
	sid := string(s.Id())
	appID := firstStr(data, "appId", "app_id")
	if appID == "" {
		appID = "csm"
	}
	username := firstStr(data, "username")
	if username == "" {
		username = "Guest"
	}
	userID := firstStr(data, "userId", "user_id")
	isAdmin, _ := data["isAdmin"].(bool)
	guestPhone := firstStr(data, "guestPhone", "guest_phone")
	guestSessionID := firstStr(data, "guestSessionId", "guest_session_id")
	locale := firstStr(data, "locale")
	if locale == "" {
		locale = "vi"
	}

	st := &sessionState{
		appID: appID, username: username, guestPhone: guestPhone,
		guestIdentity: guestSessionID, locale: locale, isAdmin: isAdmin,
	}
	sessionMu.Lock()
	sessions[sid] = st
	sessionMu.Unlock()

	if isAdmin {
		masterRoom := "app:" + appID
		s.Join(socketio.Room(masterRoom))
		_ = s.Emit("user_joined", map[string]any{"room": masterRoom, "username": username})
		return
	}

	if guestSessionID != "" || guestPhone != "" {
		identity := guestSessionID
		if identity == "" {
			identity = guestPhone
		}
		if identity == "" {
			identity = sid
		}
		st.guestIdentity = identity
		privateRoom := "guest:" + appID + ";" + identity
		masterRoom := "app:" + appID
		s.Join(socketio.Room(privateRoom))
		s.Join(socketio.Room(masterRoom))
		_ = s.Emit("user_joined", map[string]any{"room": privateRoom, "username": username})
		return
	}

	room := firstStr(data, "room")
	if room == "" {
		room = appID
	}
	s.Join(socketio.Room(room))
	_ = s.Emit("user_joined", map[string]any{"room": room})

	if userID != "" {
		authRoom := "auth:user:" + userID
		s.Join(socketio.Room(authRoom))
		_ = s.Emit("user_joined", map[string]any{"room": authRoom, "username": username})
	}
}

func handleChat(s *socketio.Socket, deps Dependencies, data map[string]any) {
	if data == nil {
		return
	}
	sid := string(s.Id())
	sessionMu.RLock()
	st := sessions[sid]
	sessionMu.RUnlock()

	appID := firstStr(data, "appId", "app_id")
	if appID == "" && st != nil {
		appID = st.appID
	}
	if appID == "" {
		appID = "csm"
	}
	data["appId"] = appID

	isAdmin, _ := data["isAdmin"].(bool)
	if !isAdmin && st != nil && st.isAdmin {
		isAdmin = true
	}
	userID := firstStr(data, "userId", "user_id")
	room, _ := data["room"].(string)
	guestContext := strings.HasPrefix(room, "guest:") || userID == ""

	if isAdmin && guestContext {
		// admin replying in guest context — persist + broadcast
	} else if userID == "" {
		guestIdentity := firstStr(data, "guestSessionId", "guest_session_id")
		if guestIdentity == "" && st != nil {
			guestIdentity = st.guestIdentity
		}
		if guestIdentity == "" {
			guestIdentity = sid
		}
		data["guestSessionId"] = guestIdentity
		if _, ok := data["username"]; !ok {
			data["username"] = "Khach hang"
		}
		data["room"] = "guest:" + appID + ";" + guestIdentity
		if st != nil && st.guestPhone != "" && firstStr(data, "guestPhone", "guest_phone") == "" {
			data["guestPhone"] = st.guestPhone
		}
	}

	if data["timestamp"] == nil {
		data["timestamp"] = time.Now().UnixMilli()
	}

	if err := deps.Chat.SaveMessage(appID, data); err != nil {
		log.Printf("Socket chat save failed: %v", err)
	}
	s.Broadcast().Emit("message", data)

	if guestContext && !isAdmin {
		message := firstStr(data, "message", "text", "content")
		locale := "vi"
		sessionMu.RLock()
		if st != nil && st.locale != "" {
			locale = st.locale
		}
		sessionMu.RUnlock()
		if strings.TrimSpace(message) != "" {
			go emitGuestAiReply(s, deps, appID, data, message, locale)
		}
	}
}

func handleRegisterGuestPhone(s *socketio.Socket, deps Dependencies, data map[string]any) {
	appID := firstStr(data, "appId", "app_id")
	oldIdentity := firstStr(data, "guestSessionId", "guest_session_id")
	phone := firstStr(data, "phone")
	if appID == "" || oldIdentity == "" || phone == "" {
		_ = s.Emit("register_guest_phone", map[string]any{"success": false, "error": "Missing required fields"})
		return
	}
	rebound := deps.Chat.RebindGuestPhone(appID, oldIdentity, phone)
	permanentRoom := "guest:" + appID + ";" + phone
	s.Join(socketio.Room(permanentRoom))
	sessionMu.Lock()
	if st := sessions[string(s.Id())]; st != nil {
		st.guestIdentity = phone
		st.guestPhone = phone
	}
	sessionMu.Unlock()
	_ = s.Emit("register_guest_phone", map[string]any{
		"success": true, "phone": phone, "permanentRoom": permanentRoom, "rebound": rebound,
	})
}

func stringArg(args []any, idx int) string {
	if idx >= len(args) {
		return ""
	}
	switch v := args[idx].(type) {
	case string:
		return v
	default:
		return ""
	}
}

func mapArg(args []any, idx int) map[string]any {
	if idx >= len(args) {
		return nil
	}
	switch v := args[idx].(type) {
	case map[string]any:
		return v
	case string:
		var m map[string]any
		if json.Unmarshal([]byte(v), &m) == nil {
			return m
		}
	}
	return nil
}

func firstStr(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k].(string); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func emitGuestAiReply(s *socketio.Socket, deps Dependencies, appID string, guestMsg map[string]any, message, locale string) {
	reply := services.GuestChatReply(deps.Config, deps.Llama, message, locale, appID)
	if strings.TrimSpace(reply) == "" {
		return
	}
	room := firstStr(guestMsg, "room")
	if room == "" {
		room = "guest:" + appID
	}
	replyData := map[string]any{
		"room": room, "appId": appID, "message": reply,
		"username": "CSM AI", "isBot": true, "isAdmin": false,
		"timestamp":      time.Now().UnixMilli(),
		"guestSessionId": firstStr(guestMsg, "guestSessionId", "guest_session_id"),
	}
	if err := deps.Chat.SaveMessage(appID, replyData); err != nil {
		log.Printf("Guest AI reply save failed: %v", err)
	}
	s.Broadcast().Emit("message", replyData)
}
