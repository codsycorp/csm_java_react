package services

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

type ChatService struct {
	rm *data.RecordManager
}

func NewChatService(rm *data.RecordManager) *ChatService {
	return &ChatService{rm: rm}
}

func ChatTable(appID string) string {
	return appID + "_chat_messages"
}

func (c *ChatService) GetHistory(appID, roomID string) map[string]any {
	filter := model.EqFilter("room", roomID)
	return c.rm.Filter(appID, ChatTable(appID), filter)
}

func (c *ChatService) allMessagesForApp(appID string) []map[string]any {
	page := c.rm.Filter(appID, ChatTable(appID), model.SearchFilter{})
	return rowsFromChat(page)
}

func rowsFromChat(result map[string]any) []map[string]any {
	var raw []any
	if v, ok := result["data"]; ok {
		raw, _ = v.([]any)
	} else if v, ok := result["rows"]; ok {
		raw, _ = v.([]any)
	}
	var out []map[string]any
	for _, item := range raw {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func msgAppID(msg map[string]any) string {
	if v, ok := msg["appId"].(string); ok && v != "" {
		return v
	}
	if v, ok := msg["app_id"].(string); ok {
		return v
	}
	return ""
}

func msgTimestamp(msg map[string]any) int64 {
	switch v := msg["timestamp"].(type) {
	case float64:
		return int64(v)
	case int64:
		return v
	case int:
		return int64(v)
	default:
		return 0
	}
}

func matchesGuest(msg map[string]any, guestSessionID string, guestPhone string) bool {
	sid, _ := msg["guestSessionId"].(string)
	phone, _ := msg["guestPhone"].(string)
	to, _ := msg["to"].(string)
	if guestSessionID != "" && (sid == guestSessionID || to == guestSessionID) {
		return true
	}
	if guestPhone != "" && (phone == guestPhone || to == guestPhone || sid == guestPhone) {
		return true
	}
	return false
}

func (c *ChatService) GetHistoryByGuestIdentity(appID string, guestSessionID, guestPhone string, limit int) []map[string]any {
	sid := strings.TrimSpace(guestSessionID)
	phone := strings.TrimSpace(guestPhone)
	if sid == "" && phone == "" {
		return nil
	}
	var matched []map[string]any
	for _, msg := range c.allMessagesForApp(appID) {
		app := msgAppID(msg)
		if app != "" && app != appID {
			continue
		}
		if matchesGuest(msg, sid, phone) {
			matched = append(matched, msg)
		}
	}
	sort.Slice(matched, func(i, j int) bool {
		return msgTimestamp(matched[i]) < msgTimestamp(matched[j])
	})
	if limit > 0 && len(matched) > limit {
		matched = matched[len(matched)-limit:]
	}
	return matched
}

func (c *ChatService) GetGuestSessionsByAppID(appID string) []string {
	seen := map[string]struct{}{}
	for _, msg := range c.allMessagesForApp(appID) {
		if s, _ := msg["guestSessionId"].(string); s != "" {
			seen[s] = struct{}{}
		}
		if p, _ := msg["guestPhone"].(string); p != "" {
			seen[p] = struct{}{}
		}
	}
	out := make([]string, 0, len(seen))
	for s := range seen {
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

func (c *ChatService) SaveMessage(appID string, message map[string]any) error {
	if message["id"] == nil || message["id"] == "" {
		message["id"] = uuid.New().String()
	}
	if message["timestamp"] == nil {
		message["timestamp"] = time.Now().UnixMilli()
	}
	if message["appId"] == nil {
		message["appId"] = appID
	}
	_, err := c.rm.CreateRecord(appID, ChatTable(appID), message, nil)
	if err != nil {
		return fmt.Errorf("save chat message: %w", err)
	}
	return nil
}

func (c *ChatService) RebindGuestPhone(appID, oldIdentity, newPhone string) int {
	if oldIdentity == "" || newPhone == "" {
		return 0
	}
	newRoom := fmt.Sprintf("guest:%s;%s", appID, newPhone)
	updated := 0
	for _, msg := range c.allMessagesForApp(appID) {
		sid, _ := msg["guestSessionId"].(string)
		phone, _ := msg["guestPhone"].(string)
		to, _ := msg["to"].(string)
		if oldIdentity != sid && oldIdentity != phone {
			continue
		}
		msg["guestPhone"] = newPhone
		msg["guestSessionId"] = newPhone
		msg["room"] = newRoom
		if oldIdentity == to {
			msg["to"] = newPhone
		}
		if msg["id"] == nil || msg["id"] == "" {
			msg["id"] = uuid.New().String()
		}
		if err := c.SaveMessage(appID, msg); err == nil {
			updated++
		}
	}
	return updated
}
