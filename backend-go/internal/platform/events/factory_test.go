package events

import (
	"context"
	"testing"
	"time"

	"csm_server/backend-go/internal/config"
)

func TestNewBusDefaultsMemory(t *testing.T) {
	cfg := config.AppConfig{}
	cfg.Platform.EventBusMode = "memory"
	bus := NewBus(cfg)
	if bus == nil {
		t.Fatal("expected bus")
	}
	called := false
	bus.Subscribe("test.topic", func(ctx context.Context, ev Event) error {
		called = true
		return nil
	})
	bus.Publish(context.Background(), Event{Topic: "test.topic", Payload: map[string]any{"k": "v"}})
	// handlers run async
	if !waitUntil(func() bool { return called }) {
		t.Fatal("handler not invoked")
	}
}

func waitUntil(fn func() bool) bool {
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if fn() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return fn()
}
