package events

import (
	"log"
	"strings"

	"csm_server/backend-go/internal/config"
)

// NewBus returns memory or redis-backed event bus (falls back to memory).
func NewBus(cfg config.AppConfig) Bus {
	mode := strings.ToLower(strings.TrimSpace(cfg.Platform.EventBusMode))
	if mode != "redis" {
		log.Printf("EventBus: in-memory mode")
		return NewMemoryBus()
	}
	rb, err := newRedisBus(cfg)
	if err != nil {
		log.Printf("EventBus: redis unavailable (%v) — using memory", err)
		return NewMemoryBus()
	}
	return rb
}
