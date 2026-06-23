package events

import (
	"context"
	"log"
	"sync"
)

// Event is a domain event for decoupled handlers (table updates, AI jobs, etc.).
type Event struct {
	Topic   string
	Payload map[string]any
}

// Handler processes a published event.
type Handler func(ctx context.Context, ev Event) error

// Bus is an in-process pub/sub (upgrade path: Redis/NATS).
type Bus interface {
	Publish(ctx context.Context, ev Event)
	Subscribe(topic string, h Handler)
	Close() error
}

type memoryBus struct {
	mu       sync.RWMutex
	handlers map[string][]Handler
}

// NewMemoryBus creates a lightweight event bus (default).
func NewMemoryBus() Bus {
	return &memoryBus{handlers: make(map[string][]Handler)}
}

func (b *memoryBus) Publish(ctx context.Context, ev Event) {
	b.invoke(ctx, ev)
}

func (b *memoryBus) invoke(ctx context.Context, ev Event) {
	b.mu.RLock()
	handlers := append([]Handler(nil), b.handlers[ev.Topic]...)
	b.mu.RUnlock()
	for _, h := range handlers {
		go func(fn Handler) {
			if err := fn(ctx, ev); err != nil {
				log.Printf("event bus %s: %v", ev.Topic, err)
			}
		}(h)
	}
}

func (b *memoryBus) Subscribe(topic string, h Handler) {
	b.mu.Lock()
	b.handlers[topic] = append(b.handlers[topic], h)
	b.mu.Unlock()
}

func (b *memoryBus) Close() error { return nil }
