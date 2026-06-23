package outbox

import (
	"context"
	"log"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/platform/events"
	"csm_server/backend-go/internal/platform/metrics"
)

// Handler processes a dequeued outbox message (publish, lake export, lineage, etc.).
type Handler func(ctx context.Context, msg Message) error

// Worker polls the outbox and dispatches messages to handlers.
type Worker struct {
	store    *Store
	bus      events.Bus
	handlers []Handler
	batch    int
	interval time.Duration
	stop     chan struct{}
}

func NewWorker(cfg config.AppConfig, store *Store, bus events.Bus, extra ...Handler) *Worker {
	batch := cfg.Platform.OutboxBatchSize
	if batch <= 0 {
		batch = 50
	}
	interval := time.Duration(cfg.Platform.OutboxPollMs) * time.Millisecond
	if interval <= 0 {
		interval = 500 * time.Millisecond
	}
	handlers := []Handler{publishHandler(bus)}
	handlers = append(handlers, extra...)
	return &Worker{
		store:    store,
		bus:      bus,
		handlers: handlers,
		batch:    batch,
		interval: interval,
		stop:     make(chan struct{}),
	}
}

func publishHandler(bus events.Bus) Handler {
	return func(ctx context.Context, msg Message) error {
		if bus == nil {
			return nil
		}
		bus.Publish(ctx, events.Event{Topic: msg.Topic, Payload: msg.Payload})
		return nil
	}
}

func (w *Worker) Start() {
	if w == nil || w.store == nil || !w.store.Enabled() {
		return
	}
	go w.loop()
	log.Printf("OutboxWorker: started (batch=%d interval=%s)", w.batch, w.interval)
}

func (w *Worker) Stop() {
	if w == nil || w.stop == nil {
		return
	}
	select {
	case <-w.stop:
	default:
		close(w.stop)
	}
}

func (w *Worker) loop() {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-w.stop:
			return
		case <-ticker.C:
			w.drainOnce()
		}
	}
}

func (w *Worker) drainOnce() {
	ctx := context.Background()
	msgs, err := w.store.PendingBatch(w.batch)
	if err != nil || len(msgs) == 0 {
		return
	}
	start := time.Now()
	for _, msg := range msgs {
		if err := w.dispatch(ctx, msg); err != nil {
			_ = w.store.MarkFailed(msg)
			continue
		}
		_ = w.store.MarkPublished(msg)
	}
	metrics.ObserveOutboxDrain(time.Since(start), len(msgs))
}

func (w *Worker) dispatch(ctx context.Context, msg Message) error {
	for _, h := range w.handlers {
		if err := h(ctx, msg); err != nil {
			return err
		}
	}
	return nil
}
