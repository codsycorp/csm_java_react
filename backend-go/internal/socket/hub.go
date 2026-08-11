package socket

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"

	socketio "github.com/zishang520/socket.io/v2/socket"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/services"
)

type Hub struct {
	io   *socketio.Server
	once sync.Once
}

func NewHub() *Hub {
	return &Hub{io: socketio.NewServer(nil, nil)}
}

func (h *Hub) IO() *socketio.Server {
	return h.io
}

func (h *Hub) Register(deps Dependencies) {
	h.io.On("connection", func(clients ...any) {
		s := clients[0].(*socketio.Socket)
		log.Printf("Socket connected: %s", s.Id())
		registerSocketEvents(s, h.io, deps)
		s.On("disconnect", func(_ ...any) {
			log.Printf("Socket disconnected: %s", s.Id())
		})
	})
}

type Dependencies struct {
	Config config.AppConfig
	RM     *data.RecordManager
	Chat   *services.ChatService
	Llama  *services.LlamaService
}

func (h *Hub) Start(host string, port int) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	go func() {
		mux := http.NewServeMux()
		mux.Handle("/socket.io/", h.io.ServeHandler(nil))
		log.Printf("Socket.IO server listening on %s", addr)
		if err := http.ListenAndServe(addr, mux); err != nil && err != http.ErrServerClosed {
			log.Printf("Socket.IO server error: %v", err)
		}
	}()
	return nil
}

func (h *Hub) Close() {
	h.once.Do(func() {
		if h.io != nil {
			h.io.Close(nil)
		}
	})
}

func (h *Hub) EmitUpdateNotification(rm *data.RecordManager, appID, table, action string, row map[string]any) {
	if h == nil || h.io == nil || row == nil {
		return
	}
	pkFields := rm.GetTablePKFields(appID, table)
	primaryKeys := map[string]any{}
	for _, f := range pkFields {
		if v, ok := row[f]; ok {
			primaryKeys[f] = v
		}
	}
	message := fmt.Sprintf("Table '%s' has been %sd.", table, action)
	if action == "delete" {
		message = fmt.Sprintf("Table '%s' has been deleted.", table)
	}
	notification := map[string]any{
		"appId": appID, "table": table, "action": action,
		"obj_name": table, "cmd": action,
		"primaryKeys": primaryKeys, "dataRow": row, "data": row,
		"message": message, "success": true,
	}
	h.io.To(socketio.Room(appID)).Emit("csm_msg_update", notification)
	if appID != "csm" {
		h.io.To(socketio.Room("csm")).Emit("csm_msg_update", notification)
	}
}

func (h *Hub) EmitForceLogout(userID, reason, message string, loginVersion int) {
	if h == nil || h.io == nil {
		return
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}
	payload := map[string]any{
		"userId":       userID,
		"reason":       strings.TrimSpace(reason),
		"message":      strings.TrimSpace(message),
		"loginVersion": loginVersion,
	}
	h.io.To(socketio.Room("auth:user:"+userID)).Emit("force_logout", payload)
}
